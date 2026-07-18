'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Toast from '../Components/Toast';
import AuthSideArt from '../Components/AuthSideArt';
import { supabase } from "../lib/supabase";

function Page() {
  const [username, setUsername] = useState('');
  const [pass, setPass] = useState('');
  const [message, setMessage] = useState('');
  const [flag, setFlag] = useState(false);
  const [load, setLoad] = useState(false);
  const [inc, setInc] = useState(false);
  const [nf, setNF] = useState(false);
  const router = useRouter();

  function handleChange(event) {
    setUsername(event.target.value);
  }

  function handleChange2(event) {
    setPass(event.target.value);
  }

  async function fetchCookie(e) {
    e.preventDefault();

    if (pass.length < 6) {
      setMessage('Password must be at least 6 characters.');
      setNF(true);
      return;
    }

    try {
      if (username !== '' && pass !== '') {
        setInc(false);
        setLoad(true);

        const { error } = await supabase.auth.signInWithPassword({
          email: username,
          password: pass,
        });
        if (error) throw error;

        setLoad(false);
        setFlag(true);
        setTimeout(() => router.push('/'), 1000);
      } else {
        setInc(true);
      }
    } catch (error) {
      console.error('Error logging in:', error);
      if (error.message?.toLowerCase().includes('invalid login credentials')) {
        setMessage("No user found, please check again")
        setNF(true);
      }
      else if (error.message?.toLowerCase().includes('email')) {
        setMessage('Please put a valid email');
        setNF(true);
      }
      else {
        setMessage(error.message || 'Error logging in');
        setNF(true)
      }
    }
  }

  const handleClose = (event, reason) => {
    if (reason === 'clickaway') {
      return;
    }
    setFlag(false);
  };

  const handleClose2 = (event, reason) => {
    if (reason === 'clickaway') {
      return;
    }
    setInc(false);
  };

  const handleClose3 = (event, reason) => {
    if (reason === 'clickaway') {
      return;
    }
    setNF(false);
  };

  return (
    <div
      className="relative min-h-screen overflow-hidden bg-navy"
      style={{
        backgroundImage:
          "linear-gradient(to right, rgba(232,221,199,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(232,221,199,0.06) 1px, transparent 1px)",
        backgroundSize: "44px 44px",
      }}
    >
      {/* soft gold glow, top-right */}
      <div className="pointer-events-none absolute -top-32 -right-32 w-[420px] h-[420px] rounded-full bg-gold/20 blur-3xl" />
      {/* soft glow, bottom-left */}
      <div className="pointer-events-none absolute -bottom-40 -left-24 w-[380px] h-[380px] rounded-full bg-gold/10 blur-3xl" />
      {/* decorative floating squares */}
      <div className="hidden md:grid absolute top-10 left-10 grid-cols-3 gap-2 opacity-70">
        <div className="w-5 h-5 rounded-sm bg-cream/10" />
        <div className="w-5 h-5 rounded-sm bg-gold/70" />
        <div className="w-5 h-5 rounded-sm bg-cream/10" />
      </div>

      <Toast open={flag} duration={10000} onClose={handleClose} message="Success! You have been logged in!" />
      <Toast open={inc} duration={5000} onClose={handleClose2} message="Please fill all the inputs" />
      <Toast open={nf} duration={5000} onClose={handleClose3} message={message} />
      <div className="relative flex justify-center items-center min-h-screen p-4">
        <div className="flex flex-col lg:flex-row items-center gap-10 max-w-[910px] w-full">
          {/* Left side - Card */}
          <div className="w-full lg:w-1/2 p-8 h-fit bg-cream-card rounded-2xl shadow-2xl">
            <Link href="/" className="flex items-center gap-2 mb-6">
              <img src="/logo.png" alt="CityZen" className="h-9 rounded-md" />
              <span className="font-extrabold text-navy text-lg">CityZen</span>
            </Link>
            <div className="text-start">
              <h1 className="text-[30px] font-bold text-navy">Log In</h1>
              <p className="mt-3 text-lg text-navy/50">
                Welcome back! Please login to your account to continue
              </p>
            </div>
            <form className="mt-8 space-y-6">
              <div className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-navy">
                    Email
                  </label>
                  <input
                    type="email"
                    id="email"
                    placeholder="john_doe@gmail.com"
                    className="w-full mt-1 px-4 py-2 border border-navy/20 rounded-lg text-navy placeholder-navy/30 focus:outline-none focus:ring-2 focus:ring-navy/30"
                    onChange={(e) => {
                      setUsername(e.target.value)
                    }}
                  />
                </div>
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-navy">
                    Password
                  </label>
                  <input
                    type="password"
                    id="password"
                    placeholder="••••••••"
                    className="w-full mt-1 px-4 py-2 border border-navy/20 rounded-lg text-navy placeholder-navy/30 focus:outline-none focus:ring-2 focus:ring-navy/30"
                    onChange={(e) => {
                      setPass(e.target.value)
                    }}
                  />
                </div>
              </div>
              <div className="mt-6 text-center">
                <button
                  className="w-[80%] bg-navy text-cream py-3 rounded-lg hover:bg-navy-light transition mt-[10px] font-semibold"
                  onClick={fetchCookie}
                >
                  LOGIN
                </button>
              </div>
              <div
                className="text-center"
                onClick={(e) => {
                  e.preventDefault();
                  router.push("/signup");
                }}
              >
                <button className="text-navy/70 hover:underline text-sm">
                  New here? Click to Sign up!
                </button>
              </div>
            </form>
          </div>

          {/* Right side - illustrated skyline scene, drawn directly on the
              shared page background (no box of its own, so no seam). */}
          <div className="hidden lg:flex w-full lg:w-1/2 items-center justify-center">
            <AuthSideArt />
          </div>
        </div>
      </div>
      {load && !inc && <p className="text-center text-cream mt-4">Loading...</p>}
    </div>
  );
}

export default Page;
