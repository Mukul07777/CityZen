import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_SUPABASE_URL, LOCAL_ANON_KEY, LOCAL_SERVICE_ROLE_KEY } from "./setup.js";

// Integration tests for the RPC layer that IS this app's security
// boundary (see supabase/migration_2/3/4/5/7/9/11). A regression in any
// of these functions means a citizen impersonating an MCD official, or a
// report being resolved without proof, or a district's score being
// tampered with — so these are worth testing even though nothing else
// in the app currently is.
//
// Prerequisites:
//   1. Supabase CLI installed: https://supabase.com/docs/guides/cli
//   2. `supabase start` run from the project root (spins up a local
//      Postgres + API on 127.0.0.1:54321 — completely separate from your
//      real project, safe to reset/destroy freely).
//   3. All migrations in supabase/*.sql applied to that local instance,
//      in order (`supabase db reset` after placing them in
//      supabase/migrations/, or paste them into the local Studio SQL
//      editor at http://127.0.0.1:54323).
//
// Run with: npm test

const admin = createClient(LOCAL_SUPABASE_URL, LOCAL_SERVICE_ROLE_KEY);

let citizenClient, citizenId;
let mcdClient, mcdId;
let otherMcdClient, otherMcdId;
let testDistrict = "Test District A";
let testDistrictB = "Test District B";
let testPostId;

async function createTestUser(email, password) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  return data.user;
}

beforeAll(async () => {
  await admin.from("districts").upsert([
    { name: testDistrict, score: 0 },
    { name: testDistrictB, score: 0 },
  ]);

  const citizen = await createTestUser("test-citizen@cityzen.test", "password123");
  citizenId = citizen.id;
  citizenClient = createClient(LOCAL_SUPABASE_URL, LOCAL_ANON_KEY);
  await citizenClient.auth.signInWithPassword({
    email: "test-citizen@cityzen.test",
    password: "password123",
  });

  const mcd = await createTestUser("test-mcd@cityzen.test", "password123");
  mcdId = mcd.id;
  await admin.from("profiles").update({ role: "mcd", district: testDistrict }).eq("id", mcdId);
  mcdClient = createClient(LOCAL_SUPABASE_URL, LOCAL_ANON_KEY);
  await mcdClient.auth.signInWithPassword({ email: "test-mcd@cityzen.test", password: "password123" });

  const otherMcd = await createTestUser("test-mcd-b@cityzen.test", "password123");
  otherMcdId = otherMcd.id;
  await admin.from("profiles").update({ role: "mcd", district: testDistrictB }).eq("id", otherMcdId);
  otherMcdClient = createClient(LOCAL_SUPABASE_URL, LOCAL_ANON_KEY);
  await otherMcdClient.auth.signInWithPassword({
    email: "test-mcd-b@cityzen.test",
    password: "password123",
  });
});

afterAll(async () => {
  for (const id of [citizenId, mcdId, otherMcdId]) {
    if (id) await admin.auth.admin.deleteUser(id);
  }
  await admin.from("districts").delete().in("name", [testDistrict, testDistrictB]);
});

describe("submit_report", () => {
  it("creates a new post for a first-time report", async () => {
    const { data, error } = await citizenClient.rpc("submit_report", {
      p_title: "Broken streetlight",
      p_description: "Test report",
      p_img_url: "https://example.com/x.jpg",
      p_lat: 28.6,
      p_lon: 77.2,
      p_issue_category: "Electricity",
      p_severity: "Medium",
      p_district: testDistrict,
      p_user_name: "Test Citizen",
    });
    expect(error).toBeNull();
    expect(data[0].merged).toBe(false);
    testPostId = data[0].post_id;
  });

  it("merges a duplicate report at the same location instead of creating a new row", async () => {
    const { data, error } = await citizenClient.rpc("submit_report", {
      p_title: "Broken streetlight (again)",
      p_description: "Same spot",
      p_img_url: "https://example.com/x2.jpg",
      p_lat: 28.6001,
      p_lon: 77.2001,
      p_issue_category: "Electricity",
      p_severity: "Medium",
      p_district: testDistrict,
      p_user_name: "Test Citizen",
    });
    expect(error).toBeNull();
    expect(data[0].merged).toBe(true);
    expect(data[0].post_id).toBe(testPostId);
  });

  it("rejects a 6th new (non-merged) report within an hour — rate limit", async () => {
    let lastError = null;
    for (let i = 0; i < 6; i++) {
      const { error } = await citizenClient.rpc("submit_report", {
        p_title: `Distinct issue ${i}`,
        p_description: "Rate limit probe",
        p_img_url: "https://example.com/y.jpg",
        p_lat: 12.9 + i * 0.05, // spread out so none of these merge with each other
        p_lon: 77.5 + i * 0.05,
        p_issue_category: "Road",
        p_severity: "Low",
        p_district: testDistrict,
        p_user_name: "Test Citizen",
      });
      lastError = error;
    }
    expect(lastError).not.toBeNull();
    expect(lastError.message).toMatch(/rate limit/i);
  });
});

describe("complete_issue — ownership enforcement", () => {
  it("rejects a citizen (non-MCD) calling complete_issue", async () => {
    const { error } = await citizenClient.rpc("complete_issue", {
      post_id: testPostId,
      proof_url: "https://example.com/proof.jpg",
    });
    expect(error).not.toBeNull();
    expect(error.message).toMatch(/only an mcd official/i);
  });

  it("rejects an MCD official from a different district", async () => {
    const { error } = await otherMcdClient.rpc("complete_issue", {
      post_id: testPostId,
      proof_url: "https://example.com/proof.jpg",
    });
    expect(error).not.toBeNull();
    expect(error.message).toMatch(/assigned district/i);
  });

  it("rejects completion with no proof", async () => {
    const { error } = await mcdClient.rpc("complete_issue", { post_id: testPostId, proof_url: "" });
    expect(error).not.toBeNull();
    expect(error.message).toMatch(/proof/i);
  });

  it("allows the correct district's MCD official to complete with proof", async () => {
    const { error } = await mcdClient.rpc("complete_issue", {
      post_id: testPostId,
      proof_url: "https://example.com/proof.jpg",
    });
    expect(error).toBeNull();
  });
});

describe("mark_seen — ownership enforcement", () => {
  let pendingPostId;

  beforeAll(async () => {
    const { data } = await citizenClient.rpc("submit_report", {
      p_title: "Pothole for seen-test",
      p_description: "x",
      p_img_url: "https://example.com/z.jpg",
      p_lat: 40.1,
      p_lon: -70.1,
      p_issue_category: "Road",
      p_severity: "Low",
      p_district: testDistrict,
      p_user_name: "Test Citizen",
    });
    pendingPostId = data[0].post_id;
  });

  it("rejects a citizen calling mark_seen", async () => {
    const { error } = await citizenClient.rpc("mark_seen", { p_post_id: pendingPostId });
    expect(error).not.toBeNull();
  });

  it("rejects an MCD official from a different district", async () => {
    const { error } = await otherMcdClient.rpc("mark_seen", { p_post_id: pendingPostId });
    expect(error).not.toBeNull();
  });

  it("allows the correct district's MCD official", async () => {
    const { error } = await mcdClient.rpc("mark_seen", { p_post_id: pendingPostId });
    expect(error).toBeNull();
  });
});

describe("react_to_post — reaction validation", () => {
  it("rejects an invalid reaction type", async () => {
    const { error } = await citizenClient.rpc("react_to_post", {
      p_post_id: testPostId,
      p_reaction: "not_a_real_reaction",
    });
    expect(error).not.toBeNull();
  });

  it("accepts confirm and flips to flag on a second call (upsert, not duplicate row)", async () => {
    const { error: e1 } = await citizenClient.rpc("react_to_post", {
      p_post_id: testPostId,
      p_reaction: "confirm",
    });
    expect(e1).toBeNull();

    const { error: e2 } = await citizenClient.rpc("react_to_post", {
      p_post_id: testPostId,
      p_reaction: "flag",
      p_reason: "test flag",
    });
    expect(e2).toBeNull();

    const { data: reactions } = await admin
      .from("post_reactions")
      .select("*")
      .eq("post_id", testPostId)
      .eq("user_id", citizenId);
    expect(reactions.length).toBe(1); // one row, not two — upsert worked
    expect(reactions[0].reaction_type).toBe("flag");
  });
});

describe("assign_mcd_role — must not be callable by regular clients", () => {
  it("rejects calls from an authenticated (non-service-role) client", async () => {
    const { error } = await citizenClient.rpc("assign_mcd_role", {
      p_email: "test-citizen@cityzen.test",
      p_district: testDistrict,
    });
    // Expected to fail — this function is intentionally NOT granted to
    // `authenticated`/`anon` (see migration_2_mcd_roles.sql). If this
    // assertion ever fails, it means someone accidentally granted EXECUTE
    // to a role broader than intended, which would let any signed-up
    // citizen self-promote to an MCD account.
    expect(error).not.toBeNull();
  });
});
