import React, { useEffect, useRef, useState } from 'react';
import {
  ShieldAlert,
  RefreshCw,
  Lock,
  UserCheck,
  KeyRound,
  Landmark,
  Fingerprint,
  Scale,
  ArrowRight,
  Accessibility,
  Plus,
  Minus,
  Eye,
} from 'lucide-react';

import { api } from '../../lib/api.ts';

type Role = 'IO' | 'SUPERVISOR' | 'LEGAL' | 'ADMIN';

interface LoginViewProps {
  onLogin: (user: any) => void;
}

interface CaptchaState {
  challengeId: string;
  image: string;
  expiresInSeconds: number;
}

const EMBLEM_PATH = '/assets/karnataka-emblem.png.png';
const BUILDING_PATH = '/assets/government-building.jpg.png';

export const LoginView: React.FC<LoginViewProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('IO');

  const [captcha, setCaptcha] = useState<CaptchaState | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');

  const [loading, setLoading] = useState(false);
  const [captchaLoading, setCaptchaLoading] = useState(false);

  const [error, setError] = useState('');

  const [fontScale, setFontScale] = useState(1);
  const [highContrast, setHighContrast] = useState(false);

  const captchaRequestId = useRef(0);
  const initialCaptchaLoaded = useRef(false);

  const loadCaptcha = async () => {
    const requestId = ++captchaRequestId.current;

    setCaptchaLoading(true);
    setCaptchaAnswer('');

    try {
      const res = await api.getCaptcha();

      if (requestId !== captchaRequestId.current) {
        return;
      }

      if (!res || !res.success || !res.challengeId || !res.image) {
        throw new Error('Invalid CAPTCHA response');
      }

      setCaptcha({
        challengeId: res.challengeId,
        image: res.image,
        expiresInSeconds: res.expiresInSeconds ?? 300,
      });
    } catch (err) {
      console.error('CAPTCHA loading failed:', err);

      if (requestId === captchaRequestId.current) {
        setCaptcha(null);
        setCaptchaAnswer('');
        setError(
          'Unable to load security verification. Please try again.'
        );
      }
    } finally {
      if (requestId === captchaRequestId.current) {
        setCaptchaLoading(false);
      }
    }
  };

  useEffect(() => {
    if (initialCaptchaLoaded.current) {
      return;
    }

    initialCaptchaLoaded.current = true;

    void loadCaptcha();
  }, []);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();

    setError('');

    if (!username.trim() || !password) {
      setError('Invalid login credentials.');
      return;
    }

    if (!captcha || !captcha.challengeId) {
      setError('Invalid login credentials.');
      return;
    }

    const normalizedCaptchaAnswer = captchaAnswer.trim().toUpperCase();

    if (!normalizedCaptchaAnswer) {
      setError('Invalid login credentials.');
      return;
    }

    const challengeIdAtSubmit = captcha.challengeId;
    const captchaAnswerAtSubmit = normalizedCaptchaAnswer;

    setLoading(true);

    try {
      const res = await api.login(
        username.trim(),
        password,
        role,
        challengeIdAtSubmit,
        captchaAnswerAtSubmit
      );

      if (!res?.success || !res?.user) {
        setError('Invalid login credentials.');
        await loadCaptcha();
        return;
      }

      onLogin(res.user);
    } catch (err) {
      console.error('Login failed:', err);

      setError('Invalid login credentials.');

      await loadCaptcha();
    } finally {
      setLoading(false);
    }
  };

  const decreaseFont = () => {
    setFontScale((value) =>
      Math.max(0.9, Number((value - 0.05).toFixed(2)))
    );
  };

  const increaseFont = () => {
    setFontScale((value) =>
      Math.min(1.15, Number((value + 0.05).toFixed(2)))
    );
  };

  return (
    <div
      className={`min-h-screen overflow-x-hidden ${
        highContrast
          ? 'bg-white text-black'
          : 'bg-[#eef1f4] text-[#182d42]'
      }`}
      style={{
        fontSize: `${fontScale}em`,
      }}
    >
      {/* ============================================================
          TOP GOVERNMENT UTILITY BAR
      ============================================================ */}

      <div
        className={`h-9 ${
          highContrast ? 'bg-black' : 'bg-[#071f36]'
        } text-white border-b border-[#c8a548]`}
      >
        <div className="max-w-[1600px] mx-auto h-full px-4 md:px-7 flex items-center justify-between">
          <div className="flex items-center gap-3 text-[9px] md:text-[10px] font-semibold tracking-wide">
            <span>Government of Karnataka</span>

            <span className="text-[#d4b45b]">|</span>

            <span>Karnataka State Police</span>

            <span className="hidden md:inline text-slate-500">|</span>

            <span className="hidden md:inline text-slate-300">
              Secure Investigation Portal
            </span>
          </div>

          <div className="flex items-center gap-2 md:gap-4 text-[8px] md:text-[9px] font-medium">
            <span className="hidden sm:inline">ಕನ್ನಡ</span>

            <span className="hidden sm:inline text-slate-500">|</span>

            <button
              type="button"
              onClick={decreaseFont}
              title="Decrease text size"
              aria-label="Decrease text size"
              className="hover:text-[#e1c261] transition-colors"
            >
              <Minus className="w-3 h-3" />
            </button>

            <button
              type="button"
              onClick={() => setFontScale(1)}
              title="Reset text size"
              aria-label="Reset text size"
              className="hover:text-[#e1c261] transition-colors"
            >
              A
            </button>

            <button
              type="button"
              onClick={increaseFont}
              title="Increase text size"
              aria-label="Increase text size"
              className="hover:text-[#e1c261] transition-colors"
            >
              <Plus className="w-3 h-3" />
            </button>

            <span className="hidden md:inline text-slate-500">|</span>

            <button
              type="button"
              onClick={() => setHighContrast((value) => !value)}
              title="Toggle high contrast"
              aria-label="Toggle high contrast"
              className="hidden md:inline-flex items-center gap-1 hover:text-[#e1c261] transition-colors"
            >
              <Eye className="w-3 h-3" />
              Accessibility
            </button>
          </div>
        </div>
      </div>

      {/* ============================================================
          INSTITUTIONAL MASTHEAD
      ============================================================ */}

      <header className="bg-white border-b border-slate-300">
        <div className="max-w-[1600px] mx-auto px-5 md:px-8">
          <div className="min-h-[150px] flex items-center justify-center py-5">
            <div className="w-full grid grid-cols-1 lg:grid-cols-3 items-center gap-6">

              {/* LEFT */}

              <div className="hidden lg:flex items-center gap-4">
                <div className="w-[76px] h-[82px] flex items-center justify-center border-r border-slate-300 pr-4">
                  <img
                    src={EMBLEM_PATH}
                    alt="Karnataka State Emblem"
                    className="max-w-full max-h-full object-contain"
                  />
                </div>

                <div>
                  <div className="text-[9px] uppercase tracking-[0.18em] text-slate-500 font-semibold">
                    Government Department
                  </div>

                  <div
                    className="text-[19px] text-[#143a59] font-semibold mt-1"
                    style={{
                      fontFamily:
                        'Georgia, "Times New Roman", Times, serif',
                    }}
                  >
                    Karnataka State Police
                  </div>

                  <div className="text-[9px] text-slate-500 mt-1">
                    Public Safety & Investigation Administration
                  </div>
                </div>
              </div>

              {/* CENTER */}

              <div className="text-center">
                <div className="flex justify-center mb-2">
                  <img
                    src={EMBLEM_PATH}
                    alt="Government of Karnataka emblem"
                    className="w-[82px] h-[82px] object-contain"
                  />
                </div>

                <div
                  className="text-[9px] uppercase tracking-[0.26em] text-[#a17b22] font-semibold"
                  style={{
                    fontFamily:
                      'Georgia, "Times New Roman", Times, serif',
                  }}
                >
                  Government of Karnataka
                </div>

                <div
                  className="text-[25px] md:text-[31px] text-[#123754] leading-tight font-bold"
                  style={{
                    fontFamily:
                      'Georgia, "Times New Roman", Times, serif',
                  }}
                >
                  Karnataka State Police
                </div>

                <div className="text-[8px] md:text-[9px] uppercase tracking-[0.3em] text-slate-500 mt-1">
                  Service • Security • Justice
                </div>
              </div>

              {/* RIGHT */}

              <div className="hidden lg:block text-right">
                <div className="flex justify-end items-center gap-2 text-[#163c5d]">
                  <Landmark className="w-5 h-5" />

                  <span className="text-[9px] uppercase tracking-[0.15em] font-bold">
                    Institutional Digital Service
                  </span>
                </div>

                <div className="text-[9px] text-slate-500 mt-2">
                  Authorized personnel access only
                </div>

                <div className="text-[9px] font-mono text-[#163c5d] mt-1">
                  KSP / SIMS / RAMANAGARA
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ============================================================
          SIMS TITLE BAR
      ============================================================ */}

      <div
        className={`${
          highContrast ? 'bg-black' : 'bg-[#103957]'
        } text-white border-b-[4px] border-[#c7a348]`}
      >
        <div className="max-w-[1600px] mx-auto px-5 md:px-8">
          <div className="min-h-[68px] flex flex-col md:flex-row items-center justify-between gap-3 py-3">

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 border border-[#d4b45b] flex items-center justify-center">
                <Fingerprint className="w-5 h-5 text-[#e1c261]" />
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-[#e1c261] font-bold">
                  SIMS
                </div>

                <div className="text-sm md:text-base font-semibold">
                  Secure Investigation Management System
                </div>
              </div>
            </div>

            <div className="flex items-center gap-5 text-[8px] md:text-[9px] uppercase tracking-[0.12em]">
              <span className="text-[#e1c261]">
                Ramanagara Jurisdiction
              </span>

              <span className="hidden sm:inline text-slate-500">
                |
              </span>

              <span className="hidden sm:inline">
                Authorized Access
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================
          MAIN LOGIN AREA
      ============================================================ */}

      <main className="bg-[#edf0f2]">
        <div className="max-w-[1600px] mx-auto px-4 md:px-7 py-2 md:py-3">

          <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[640px] border border-slate-300 bg-white shadow-sm">

            {/* ======================================================
                LEFT INSTITUTIONAL IMAGE
            ====================================================== */}

            <section className="lg:col-span-7 relative min-h-[460px] lg:min-h-[640px] overflow-hidden">

              <img
                src={BUILDING_PATH}
                alt="Government building"
                className="absolute inset-0 w-full h-full object-cover"
              />

              {/* IMAGE OVERLAY */}

              <div className="absolute inset-0 bg-gradient-to-r from-[#061c30]/95 via-[#0b2d49]/72 to-[#123b57]/45" />

              <div className="absolute inset-0 bg-gradient-to-t from-[#061c30]/95 via-transparent to-[#061c30]/20" />

              {/* SUBTLE GOLD BORDER */}

              <div className="absolute inset-5 border border-[#d7b65a]/55 pointer-events-none" />

              {/* CONTENT */}

              <div className="relative z-10 h-full min-h-[460px] lg:min-h-[640px] flex flex-col justify-between p-8 md:p-11 lg:p-14 text-white">

                <div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-[2px] bg-[#d7b65a]" />

                    <span className="text-[9px] md:text-[10px] uppercase tracking-[0.25em] font-semibold text-[#e6cb79]">
                      Karnataka State Police
                    </span>
                  </div>

                  <h1
                    className="mt-7 text-4xl md:text-5xl xl:text-6xl leading-[1.03] font-bold max-w-2xl"
                    style={{
                      fontFamily:
                        'Georgia, "Times New Roman", Times, serif',
                    }}
                  >
                    Secure Investigation
                    <br />
                    Management System
                  </h1>

                  <div className="mt-6 w-24 h-[3px] bg-[#d3ae48]" />

                  <div className="mt-7 inline-flex items-center gap-3 bg-[#092a45]/90 border-l-[3px] border-[#d4b153] px-5 py-3">

                    <Landmark className="w-5 h-5 text-[#e4c765]" />

                    <div>
                      <div className="text-[9px] uppercase tracking-[0.18em] text-[#e4c765] font-bold">
                        Jurisdiction
                      </div>

                      <div className="text-sm font-semibold mt-0.5">
                        Ramanagara
                      </div>
                    </div>
                  </div>
                </div>

                <div className="max-w-xl">

                  <div
                    className="text-lg md:text-xl italic text-[#f0e4bd]"
                    style={{
                      fontFamily:
                        'Georgia, "Times New Roman", Times, serif',
                    }}
                  >
                    “Service • Security • Justice”
                  </div>

                  <p className="mt-4 text-xs md:text-sm leading-6 text-slate-200 max-w-lg">
                    Secure digital management of investigation records,
                    evidence, documents, review workflows and accountability
                    records within the authorized investigation environment.
                  </p>

                  <div className="mt-7 grid grid-cols-3 border border-white/20 bg-[#071f36]/55 backdrop-blur-sm">

                    <div className="p-4 border-r border-white/15">
                      <Lock className="w-5 h-5 text-[#e2c363]" />

                      <div className="mt-3 text-[9px] uppercase tracking-[0.14em] font-bold">
                        Secure
                      </div>

                      <div className="text-[8px] text-slate-300 mt-1">
                        Role-based access
                      </div>
                    </div>

                    <div className="p-4 border-r border-white/15">
                      <Fingerprint className="w-5 h-5 text-[#e2c363]" />

                      <div className="mt-3 text-[9px] uppercase tracking-[0.14em] font-bold">
                        Integrity
                      </div>

                      <div className="text-[8px] text-slate-300 mt-1">
                        SHA-256 verification
                      </div>
                    </div>

                    <div className="p-4">
                      <Scale className="w-5 h-5 text-[#e2c363]" />

                      <div className="mt-3 text-[9px] uppercase tracking-[0.14em] font-bold">
                        Accountability
                      </div>

                      <div className="text-[8px] text-slate-300 mt-1">
                        Complete audit trail
                      </div>
                    </div>

                  </div>
                </div>
              </div>
            </section>

            {/* ======================================================
                AUTHENTICATION
            ====================================================== */}

            <section className="lg:col-span-5 bg-[#f7f8f9] border-t lg:border-t-0 lg:border-l border-slate-300">

              <div className="max-w-[600px] mx-auto">

                {/* HEADER */}

                <div className="px-7 md:px-9 py-7 bg-white border-b border-slate-300">

                  <div className="flex items-start gap-4">

                    <div className="w-12 h-12 bg-[#123957] flex items-center justify-center shrink-0">
                      <UserCheck className="w-6 h-6 text-white" />
                    </div>

                    <div>
                      <div className="text-[9px] uppercase tracking-[0.18em] font-bold text-[#a17b22]">
                        Secure Access
                      </div>

                      <h2
                        className="text-2xl text-[#143a59] font-bold mt-1"
                        style={{
                          fontFamily:
                            'Georgia, "Times New Roman", Times, serif',
                        }}
                      >
                        Officer Authentication
                      </h2>

                      <p className="text-[10px] text-slate-500 mt-1.5">
                        Authorized personnel sign-in
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-200 flex items-center justify-between">

                    <div className="flex items-center gap-2 text-[8px] uppercase tracking-[0.12em] font-bold text-[#153b5a]">
                      <Landmark className="w-3.5 h-3.5" />
                      Ramanagara Jurisdiction
                    </div>

                    <div className="text-[8px] font-mono text-slate-400">
                      SIMS-AUTH
                    </div>
                  </div>
                </div>

                {/* FORM */}

                <form
                  onSubmit={handleLogin}
                  className="px-7 md:px-9 py-7 space-y-5"
                >

                  {/* ERROR */}

                  {error && (
                    <div className="border border-red-300 bg-red-50 px-4 py-3 flex items-start gap-3">

                      <ShieldAlert className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />

                      <div>
                        <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-red-800">
                          Authentication Failed
                        </div>

                        <div className="text-[9px] text-red-600 mt-1 leading-relaxed">
                          {error}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ROLE */}

                  <div>
                    <label
                      htmlFor="role"
                      className="block text-[9px] font-bold uppercase tracking-[0.12em] text-[#173b59] mb-2"
                    >
                      Institutional Role
                    </label>

                    <select
                      id="role"
                      value={role}
                      onChange={(event) =>
                        setRole(event.target.value as Role)
                      }
                      disabled={loading}
                      className="w-full h-11 border border-slate-300 bg-white px-3 text-sm text-[#183a57] outline-none focus:border-[#163e5e] focus:ring-1 focus:ring-[#163e5e] disabled:bg-slate-100"
                    >
                      <option value="IO">
                        Investigating Officer (IO)
                      </option>

                      <option value="SUPERVISOR">
                        Supervisor
                      </option>

                      <option value="LEGAL">
                        Legal Officer
                      </option>

                      <option value="ADMIN">
                        System Administrator
                      </option>
                    </select>

                    <p className="text-[8px] text-slate-400 mt-1.5">
                      Access privileges are determined by the authenticated
                      institutional role.
                    </p>
                  </div>

                  {/* USERNAME */}

                  <div>
                    <label
                      htmlFor="username"
                      className="block text-[9px] font-bold uppercase tracking-[0.12em] text-[#173b59] mb-2"
                    >
                      Username / Badge Number
                    </label>

                    <div className="relative">
                      <UserCheck className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />

                      <input
                        id="username"
                        type="text"
                        value={username}
                        onChange={(event) =>
                          setUsername(event.target.value)
                        }
                        autoComplete="username"
                        disabled={loading}
                        placeholder="Enter institutional ID"
                        className="w-full h-11 border border-slate-300 bg-white pl-10 pr-3 text-sm text-[#183a57] placeholder:text-slate-400 outline-none focus:border-[#163e5e] focus:ring-1 focus:ring-[#163e5e] disabled:bg-slate-100"
                      />
                    </div>
                  </div>

                  {/* PASSWORD */}

                  <div>
                    <label
                      htmlFor="password"
                      className="block text-[9px] font-bold uppercase tracking-[0.12em] text-[#173b59] mb-2"
                    >
                      Institutional Password
                    </label>

                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />

                      <input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(event) =>
                          setPassword(event.target.value)
                        }
                        autoComplete="current-password"
                        disabled={loading}
                        placeholder="Enter password"
                        className="w-full h-11 border border-slate-300 bg-white pl-10 pr-3 text-sm text-[#183a57] placeholder:text-slate-400 outline-none focus:border-[#163e5e] focus:ring-1 focus:ring-[#163e5e] disabled:bg-slate-100"
                      />
                    </div>
                  </div>

                  {/* CAPTCHA */}

                  <div className="border border-slate-300 bg-white">

                    <div className="px-4 py-3 bg-[#f4f6f8] border-b border-slate-200 flex items-center justify-between">

                      <div>
                        <div className="flex items-center gap-2">
                          <KeyRound className="w-4 h-4 text-[#163d5b]" />

                          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#173b59]">
                            Security Verification
                          </span>
                        </div>

                        <p className="text-[8px] text-slate-500 mt-1">
                          Enter the characters shown below.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setError('');
                          void loadCaptcha();
                        }}
                        disabled={captchaLoading || loading}
                        title="Generate a new CAPTCHA"
                        aria-label="Generate a new CAPTCHA"
                        className="w-9 h-9 border border-slate-300 bg-white flex items-center justify-center text-slate-500 hover:text-[#123d63] hover:border-[#123d63] transition-colors disabled:opacity-50"
                      >
                        <RefreshCw
                          className={`w-4 h-4 ${
                            captchaLoading
                              ? 'animate-spin'
                              : ''
                          }`}
                        />
                      </button>
                    </div>

                    {/* CAPTCHA IMAGE */}

                    <div className="mx-4 mt-4 border border-slate-300 bg-[#fafafa] p-2 min-h-[82px] flex items-center justify-center">

                      {captchaLoading ? (
                        <div className="flex items-center gap-2 text-[9px] text-slate-500">
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          Loading security verification...
                        </div>
                      ) : captcha?.image ? (
                        <img
                          src={captcha.image}
                          alt="Security verification CAPTCHA"
                          className="block w-full max-w-[310px] h-[68px] object-contain select-none"
                          draggable={false}
                        />
                      ) : (
                        <p className="text-[9px] text-red-600">
                          Security verification unavailable.
                        </p>
                      )}
                    </div>

                    {/* CAPTCHA ANSWER */}

                    <div className="p-4">

                      <input
                        id="captcha"
                        type="text"
                        value={captchaAnswer}
                        onChange={(event) =>
                          setCaptchaAnswer(
                            event.target.value.toUpperCase()
                          )
                        }
                        disabled={
                          loading ||
                          captchaLoading ||
                          !captcha
                        }
                        placeholder="Enter CAPTCHA code"
                        inputMode="text"
                        autoComplete="off"
                        spellCheck={false}
                        maxLength={12}
                        className="w-full h-11 border border-slate-300 bg-white px-3 text-sm font-mono tracking-[0.25em] text-[#173b59] placeholder:text-slate-400 placeholder:tracking-normal outline-none focus:border-[#163e5e] focus:ring-1 focus:ring-[#163e5e] disabled:bg-slate-100"
                      />

                      {captcha && (
                        <p className="text-[8px] text-slate-400 mt-2">
                          Security challenge expires in approximately{' '}
                          {Math.ceil(
                            captcha.expiresInSeconds / 60
                          )}{' '}
                          minutes.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* SIGN IN */}

                  <button
                    type="submit"
                    disabled={
                      loading ||
                      captchaLoading ||
                      !captcha ||
                      !captchaAnswer.trim()
                    }
                    className="w-full h-12 bg-[#123957] hover:bg-[#0b2b45] text-white font-bold uppercase tracking-[0.14em] text-xs transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 border-b-[4px] border-[#c9a647]"
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Authenticating...
                      </>
                    ) : (
                      <>
                        Sign In
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>

                  {/* SECURITY NOTICE */}

                  <div className="pt-5 border-t border-slate-200 flex items-start gap-3">
                    <Lock className="w-4 h-4 text-[#153b5a] shrink-0 mt-0.5" />

                    <p className="text-[8px] leading-[1.7] text-slate-500">
                      Access to investigation records is restricted to
                      authorized personnel and subject to role, assignment,
                      jurisdiction, sensitivity and security controls.
                    </p>
                  </div>
                </form>
              </div>
            </section>
          </div>
        </div>
      </main>

      {/* ============================================================
          FOOTER
      ============================================================ */}

      <footer
        className={`${
          highContrast ? 'bg-black' : 'bg-[#071f36]'
        } text-white border-t-[4px] border-[#c9a647]`}
      >
        <div className="max-w-[1600px] mx-auto px-5 md:px-8 py-5">

          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">

            <div className="flex items-start gap-3">
              <ShieldAlert className="w-4 h-4 text-[#e1c261] mt-0.5 shrink-0" />

              <div>
                <div className="text-[9px] font-bold uppercase tracking-[0.1em]">
                  Secure Investigation Management System
                </div>

                <div className="text-[8px] text-slate-300 mt-1 leading-relaxed">
                  Unauthorized access is prohibited. Authentication and
                  security events are subject to audit logging.
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-[8px] uppercase tracking-[0.08em] text-slate-300">
              <span>Confidential</span>

              <span className="text-slate-600">|</span>

              <span>Official Use Only</span>

              <span className="text-slate-600">|</span>

              <span>Karnataka State Police</span>

              <span className="text-slate-600">|</span>

              <span>Ramanagara Jurisdiction</span>
            </div>
          </div>
        </div>
      </footer>

      <div className="sr-only" aria-live="polite">
        <Accessibility />
      </div>
    </div>
  );
};

export default LoginView;