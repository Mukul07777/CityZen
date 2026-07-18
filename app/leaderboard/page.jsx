'use client';
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Messaging } from "react-cssfx-loading";

function Leaderboard() {
  const [tab, setTab] = useState('districts'); // 'districts' | 'citizens'
  const [fetchedDistricts, setFetchedDistricts] = useState([]); // Store original data as an array
  const [districts, setDistricts] = useState([]); // Filtered data
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const districtsPerPage = 10;
  const [load, setLoad] = useState(true);

  const [fetchedCitizens, setFetchedCitizens] = useState([]);
  const [citizens, setCitizens] = useState([]);
  const [citizenSearch, setCitizenSearch] = useState('');
  const [citizenPage, setCitizenPage] = useState(1);
  const [citizensLoad, setCitizensLoad] = useState(true);
  const citizensPerPage = 10;

  const formatDuration = (hours) => {
    if (hours == null) return "—";
    if (hours < 1) return "<1h";
    if (hours < 48) return `${Math.round(hours)}h`;
    return `${Math.round(hours / 24)}d`;
  };

  useEffect(() => {
    const loadDistricts = async () => {
      const [{ data: rows, error }, { data: completedPosts, error: postsError }] = await Promise.all([
        supabase.from('districts').select('name, email, score').order('score', { ascending: false }),
        supabase
          .from('posts')
          .select('district, created_at, completed_at')
          .eq('tag', 'Completed'),
      ]);

      if (error) {
        console.error('Error fetching districts:', error);
        setLoad(false);
        return;
      }
      if (postsError) {
        console.error('Error fetching completed posts:', postsError);
      }

      // Average resolution time per district, computed client-side from
      // every completed post's created_at -> completed_at gap. A more
      // honest accountability signal than the raw score alone, since a
      // district could rack up points slowly over months.
      const avgHoursByDistrict = {};
      if (completedPosts) {
        const grouped = {};
        completedPosts.forEach((p) => {
          if (!p.completed_at) return;
          const hours = (new Date(p.completed_at) - new Date(p.created_at)) / 36e5;
          (grouped[p.district] ||= []).push(hours);
        });
        Object.entries(grouped).forEach(([district, hoursList]) => {
          avgHoursByDistrict[district] = hoursList.reduce((a, b) => a + b, 0) / hoursList.length;
        });
      }

      const sortedData = rows.map((row, index) => ({
        district: row.name,
        email: row.email,
        score: row.score,
        rank: index + 1,
        avgResolutionHours: avgHoursByDistrict[row.name] ?? null,
      }));

      setFetchedDistricts(sortedData);
      setDistricts(sortedData);
      setLoad(false);
    };

    loadDistricts();

    // Live updates: re-fetch whenever a district's score changes.
    const channel = supabase
      .channel('districts-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'districts' }, () => {
        loadDistricts();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Citizen leaderboard — queries the citizen_leaderboard view added in
  // migration_8_citizen_leaderboard.sql (weighted: reports*3 + confirms*1 +
  // evidence-confirms*2). No points balance is stored anywhere; this is a
  // read-only ranking, not a redemption ledger.
  useEffect(() => {
    const loadCitizens = async () => {
      const { data: rows, error } = await supabase
        .from('citizen_leaderboard')
        .select('user_id, username, reports_submitted, plain_confirms, evidence_confirms, score')
        .order('score', { ascending: false })
        .limit(200);

      if (error) {
        console.error('Error fetching citizen leaderboard:', error);
        setCitizensLoad(false);
        return;
      }

      const ranked = rows
        .filter((r) => r.score > 0)
        .map((row, index) => ({ ...row, rank: index + 1 }));

      setFetchedCitizens(ranked);
      setCitizens(ranked);
      setCitizensLoad(false);
    };
    loadCitizens();
  }, []);

  const handleCitizenSearch = (e) => {
    const query = e.target.value;
    setCitizenSearch(query);
    setCitizens(
      fetchedCitizens.filter((c) => (c.username || '').toLowerCase().includes(query.toLowerCase()))
    );
    setCitizenPage(1);
  };

  const handleCitizenReset = () => {
    setCitizens(fetchedCitizens);
    setCitizenSearch('');
  };

  const totalCitizenPages = Math.ceil(citizens.length / citizensPerPage);
  const paginatedCitizens = citizens.slice(
    (citizenPage - 1) * citizensPerPage,
    citizenPage * citizensPerPage
  );

  const handleSearch = (e) => {
    const query = e.target.value;
    setSearchQuery(query);
  
    const filteredDistricts = fetchedDistricts.filter((district) =>
      district.district.toLowerCase().includes(query.toLowerCase()) // Changed from startsWith to includes
    );
    setDistricts(filteredDistricts);
  };

  const handleReset = () => {
    setDistricts(fetchedDistricts); // Reset to original data
    setSearchQuery('');
  };

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  const totalPages = Math.ceil(districts.length / districtsPerPage);
  const paginatedDistricts = districts.slice(
    (currentPage - 1) * districtsPerPage,
    currentPage * districtsPerPage
  );

  return (
    <div className="min-h-screen bg-cream flex justify-center p-6 md:p-10">
      <div className="rounded-2xl max-w-4xl w-full p-8 bg-cream-card border border-navy/10 shadow-md h-fit">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <h1 className="text-3xl font-bold text-navy">Leaderboard</h1>
          <div className="inline-flex rounded-lg border border-navy/20 p-1 bg-cream w-fit">
            <button
              onClick={() => setTab('districts')}
              className={`px-4 py-1.5 rounded-md text-sm font-semibold transition ${
                tab === 'districts' ? 'bg-navy text-cream' : 'text-navy/60'
              }`}
            >
              MCD Districts
            </button>
            <button
              onClick={() => setTab('citizens')}
              className={`px-4 py-1.5 rounded-md text-sm font-semibold transition ${
                tab === 'citizens' ? 'bg-navy text-cream' : 'text-navy/60'
              }`}
            >
              Citizens
            </button>
          </div>
        </div>

      {tab === 'districts' && !load && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <p className="text-navy/50 text-sm">Ranked by resolution score.</p>
            <div className="relative w-full sm:max-w-xs">
              <input
                type="text"
                value={searchQuery}
                onChange={handleSearch}
                placeholder="Search by district..."
                className="w-full px-4 py-2 border border-navy/20 rounded-lg text-navy placeholder-navy/30 focus:outline-none focus:ring-2 focus:ring-navy/30"
              />
              {searchQuery && (
                <button
                  onClick={handleReset}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 text-navy/40"
                >
                  ×
                </button>
              )}
            </div>
          </div>
          <div className="overflow-auto rounded-xl border border-navy/10">
            <table className="w-full table-auto text-navy">
              <thead>
                <tr className="bg-navy text-cream">
                  <th className="px-4 py-3 text-left text-sm font-semibold rounded-tl-xl">Rank</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">District</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">Email</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">Avg. Resolution Time</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold rounded-tr-xl">Score</th>
                </tr>
              </thead>
              <tbody>
                {paginatedDistricts.map((district) => (
                  <tr
                    key={district.district}
                    className={`border-b border-navy/10 ${
                      district.rank <= 3 ? 'font-semibold' : ''
                    } ${district.rank === 1 ? 'bg-gold-light/60' : ''} ${
                      district.rank === 2 ? 'bg-navy/5' : ''
                    } ${district.rank === 3 ? 'bg-gold-light/30' : ''}`}
                  >
                    <td className="px-4 py-3">{district.rank}</td>
                    <td className="px-4 py-3">{district.district}</td>
                    <td className="px-4 py-3 text-navy/60">{district.email}</td>
                    <td className="px-4 py-3 text-navy/60">
                      {formatDuration(district.avgResolutionHours)}
                    </td>
                    <td className="px-4 py-3">{district.score}</td>
                  </tr>
                ))}
                {paginatedDistricts.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-navy/40">
                      No districts match your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex justify-center items-center mt-6 gap-2">
            <button
              onClick={() => handlePageChange(1)}
              disabled={currentPage === 1}
              className="px-4 py-2 bg-navy text-cream rounded-lg hover:bg-navy-light disabled:opacity-40"
            >
              First
            </button>
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="px-4 py-2 bg-navy text-cream rounded-lg hover:bg-navy-light disabled:opacity-40"
            >
              {"<"}
            </button>
            <span className="px-4 py-2 text-navy/60 text-sm">
              {currentPage} / {totalPages || 1}
            </span>
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="px-4 py-2 bg-navy text-cream rounded-lg hover:bg-navy-light disabled:opacity-40"
            >
              {">"}
            </button>
            <button
              onClick={() => handlePageChange(totalPages)}
              disabled={currentPage === totalPages}
              className="px-4 py-2 bg-navy text-cream rounded-lg hover:bg-navy-light disabled:opacity-40"
            >
              Last
            </button>
          </div>
        </>
      )}
      {tab === 'districts' && load && (
        <div className="flex items-center justify-center h-40">
          <Messaging color="grey" width="20px" height="20px" duration="0.5s" />
        </div>
      )}

      {tab === 'citizens' && !citizensLoad && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <p className="text-navy/50 text-sm">
              Ranked by civic engagement score: reports submitted (×3) + confirmations given
              (×1) + confirmations with photo evidence (×2). No redeemable prizes — bragging
              rights only, for now.
            </p>
            <div className="relative w-full sm:max-w-xs">
              <input
                type="text"
                value={citizenSearch}
                onChange={handleCitizenSearch}
                placeholder="Search by name..."
                className="w-full px-4 py-2 border border-navy/20 rounded-lg text-navy placeholder-navy/30 focus:outline-none focus:ring-2 focus:ring-navy/30"
              />
              {citizenSearch && (
                <button
                  onClick={handleCitizenReset}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 text-navy/40"
                >
                  ×
                </button>
              )}
            </div>
          </div>
          <div className="overflow-auto rounded-xl border border-navy/10">
            <table className="w-full table-auto text-navy">
              <thead>
                <tr className="bg-navy text-cream">
                  <th className="px-4 py-3 text-left text-sm font-semibold rounded-tl-xl">Rank</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">Citizen</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">Reports</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">Confirms</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">With Evidence</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold rounded-tr-xl">Score</th>
                </tr>
              </thead>
              <tbody>
                {paginatedCitizens.map((c) => (
                  <tr
                    key={c.user_id}
                    className={`border-b border-navy/10 ${c.rank <= 3 ? 'font-semibold' : ''} ${
                      c.rank === 1 ? 'bg-gold-light/60' : ''
                    } ${c.rank === 2 ? 'bg-navy/5' : ''} ${c.rank === 3 ? 'bg-gold-light/30' : ''}`}
                  >
                    <td className="px-4 py-3">{c.rank}</td>
                    <td className="px-4 py-3">{c.username}</td>
                    <td className="px-4 py-3 text-navy/60">{c.reports_submitted}</td>
                    <td className="px-4 py-3 text-navy/60">{c.plain_confirms}</td>
                    <td className="px-4 py-3 text-navy/60">{c.evidence_confirms}</td>
                    <td className="px-4 py-3">{c.score}</td>
                  </tr>
                ))}
                {paginatedCitizens.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-navy/40">
                      No citizens match your search yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex justify-center items-center mt-6 gap-2">
            <button
              onClick={() => setCitizenPage(1)}
              disabled={citizenPage === 1}
              className="px-4 py-2 bg-navy text-cream rounded-lg hover:bg-navy-light disabled:opacity-40"
            >
              First
            </button>
            <button
              onClick={() => setCitizenPage((p) => Math.max(1, p - 1))}
              disabled={citizenPage === 1}
              className="px-4 py-2 bg-navy text-cream rounded-lg hover:bg-navy-light disabled:opacity-40"
            >
              {"<"}
            </button>
            <span className="px-4 py-2 text-navy/60 text-sm">
              {citizenPage} / {totalCitizenPages || 1}
            </span>
            <button
              onClick={() => setCitizenPage((p) => Math.min(totalCitizenPages, p + 1))}
              disabled={citizenPage === totalCitizenPages}
              className="px-4 py-2 bg-navy text-cream rounded-lg hover:bg-navy-light disabled:opacity-40"
            >
              {">"}
            </button>
            <button
              onClick={() => setCitizenPage(totalCitizenPages)}
              disabled={citizenPage === totalCitizenPages}
              className="px-4 py-2 bg-navy text-cream rounded-lg hover:bg-navy-light disabled:opacity-40"
            >
              Last
            </button>
          </div>
        </>
      )}
      {tab === 'citizens' && citizensLoad && (
        <div className="flex items-center justify-center h-40">
          <Messaging color="grey" width="20px" height="20px" duration="0.5s" />
        </div>
      )}
      </div>
    </div>
  );
}

export default Leaderboard;
