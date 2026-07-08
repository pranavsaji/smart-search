import {
  Sparkles, Zap, Users, Lock, ShoppingBag, Wrench, Stethoscope,
  Plane, Code2, CalendarClock, ArrowRight, Globe,
} from 'lucide-react'
import { IntentInput } from '@/components/IntentInput'
import { Navbar } from '@/components/layout/Navbar'
import { auth } from '@/lib/auth'

const EXAMPLE_PROMPTS = [
  'Plan a 3-day Paris trip with @alex — flights from London, mid-range',
  'I need a plumber for a leak in Manchester, today if possible',
  'Find me a good therapist in London, video sessions preferred',
  'Buy me noise-cancelling headphones under £200',
  'I need a React developer to build a landing page — budget flexible',
  'Book a dentist appointment in Edinburgh this week',
]

const DOMAINS = [
  {
    icon: Plane,
    color: 'text-blue-400',
    iconBg: 'icon-glow-blue',
    border: 'hover:border-blue-500/25',
    glow: 'hover:shadow-blue-500/8',
    title: 'Travel',
    desc: 'Flights, hotels, cars, experiences',
  },
  {
    icon: ShoppingBag,
    color: 'text-orange-400',
    iconBg: 'icon-glow-orange',
    border: 'hover:border-orange-500/25',
    glow: 'hover:shadow-orange-500/8',
    title: 'Shopping',
    desc: 'Products across major retailers',
  },
  {
    icon: Wrench,
    color: 'text-lime-400',
    iconBg: 'icon-glow-lime',
    border: 'hover:border-lime-500/25',
    glow: 'hover:shadow-lime-500/8',
    title: 'Home Services',
    desc: 'Plumbers, electricians, cleaners',
  },
  {
    icon: Stethoscope,
    color: 'text-pink-400',
    iconBg: 'icon-glow-pink',
    border: 'hover:border-pink-500/25',
    glow: 'hover:shadow-pink-500/8',
    title: 'Health',
    desc: 'GPs, dentists, therapists',
  },
  {
    icon: Code2,
    color: 'text-violet-400',
    iconBg: 'icon-glow-violet',
    border: 'hover:border-violet-500/25',
    glow: 'hover:shadow-violet-500/8',
    title: 'Digital Services',
    desc: 'Developers, designers, writers',
  },
  {
    icon: CalendarClock,
    color: 'text-cyan-400',
    iconBg: 'icon-glow-cyan',
    border: 'hover:border-cyan-500/25',
    glow: 'hover:shadow-cyan-500/8',
    title: 'Appointments',
    desc: 'Legal, financial, coaching',
  },
]

const FEATURES = [
  {
    icon: Zap,
    color: 'text-amber-400',
    iconBg: 'icon-glow-amber',
    title: 'Assembled in seconds',
    desc: 'All relevant services fire simultaneously. Results stream in live — flights, products, professionals — at the exact same moment.',
  },
  {
    icon: Users,
    color: 'text-violet-400',
    iconBg: 'icon-glow-violet',
    title: 'Truly collaborative',
    desc: 'Tag friends with @handles. Everyone joins the same Stage, votes on options, locks their picks, and checks out together.',
  },
  {
    icon: Lock,
    color: 'text-emerald-400',
    iconBg: 'icon-glow-emerald',
    title: 'One unified checkout',
    desc: 'Lock your selections, pay once. Funds route automatically to every vendor — airlines, hotels, retailers, professionals.',
  },
]

const STEPS = [
  {
    num: '01',
    title: 'Describe what you want',
    desc: 'Type any intent in plain language. Tag friends with @handles, mention a budget, add any constraints.',
  },
  {
    num: '02',
    title: 'Stage assembles live',
    desc: 'Relevant services fire in parallel. Results stream in, ranked to your personal preferences and history.',
  },
  {
    num: '03',
    title: 'Act on everything',
    desc: 'Lock picks, let Genie auto-book, or check out — all in one place, one payment, split automatically.',
  },
]

export default async function HomePage() {
  const session = await auth().catch(() => null)
  const user = session?.user as { name?: string; handle?: string; id?: string } | undefined

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background">

      {/* ── Dot grid ── */}
      <div className="pointer-events-none fixed inset-0 dot-grid opacity-60" />

      {/* ── Soft blue orbs ── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="animate-orb-a absolute -top-72 left-1/4 h-[900px] w-[900px] rounded-full bg-blue-400/[0.09] blur-[160px]" />
        <div className="animate-orb-b absolute top-1/3 -right-48 h-[700px] w-[700px] rounded-full bg-sky-400/[0.07] blur-[140px]" />
        <div className="animate-orb-c absolute -bottom-48 left-0 h-[600px] w-[600px] rounded-full bg-blue-500/[0.06] blur-[130px]" />
        <div className="animate-orb-a absolute top-2/3 right-1/4 h-[500px] w-[500px] rounded-full bg-indigo-400/[0.06] blur-[120px]" style={{ animationDelay: '-12s' }} />
      </div>

      {/* Floating navbar */}
      <Navbar user={user} />

      {/* ── Hero ── */}
      <section className="relative flex min-h-screen flex-col items-center justify-center px-6 pt-32 pb-20 text-center">

        {/* Eyebrow badge */}
        <div
          className="mb-10 inline-flex items-center gap-2.5 rounded-full px-5 py-2 text-sm font-medium animate-fade-in"
          style={{
            background: 'linear-gradient(135deg, rgba(37,99,235,0.08) 0%, rgba(14,165,233,0.06) 100%)',
            border: '1px solid rgba(37,99,235,0.18)',
            animationDelay: '0.1s',
            animationFillMode: 'both',
          }}
        >
          <Globe className="h-3.5 w-3.5 text-blue-500 animate-pulse-glow" />
          <span className="gradient-text-vivid font-semibold">The Intent Operating System</span>
        </div>

        {/* Headline */}
        <h1
          className="mb-6 max-w-5xl leading-[1.06] tracking-tight"
          style={{
            animation: 'reveal 0.9s cubic-bezier(0.16,1,0.3,1) 0.2s both',
          }}
        >
          <span
            className="block text-6xl font-extrabold sm:text-7xl lg:text-[88px] xl:text-[104px]"
            style={{
              background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 40%, #0284c7 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            Type what you want.
          </span>
          <span className="block text-6xl font-extrabold text-foreground/90 sm:text-7xl lg:text-[88px] xl:text-[104px]">
            Smart Search does everything else.
          </span>
        </h1>

        {/* Subtitle */}
        <p
          className="mb-12 max-w-lg text-lg text-muted-foreground sm:text-xl leading-relaxed"
          style={{ animation: 'fade-up 0.8s ease-out 0.45s both' }}
        >
          One prompt assembles every service — travel, shopping, health, professionals — ranked to you, in parallel.
        </p>

        {/* Search portal */}
        <div
          className="w-full max-w-2xl"
          style={{ animation: 'fade-up 0.8s ease-out 0.6s both' }}
        >
          {/* Outer glow halo */}
          <div className="relative">
            <div className="absolute -inset-[1px] rounded-[22px] bg-gradient-to-r from-blue-500/25 via-sky-400/15 to-blue-500/25 blur-sm" />
            <div className="relative rounded-[20px] glass-card shadow-xl shadow-blue-500/10 overflow-hidden border border-blue-100">
              <IntentInput
                userId={user?.id}
                handle={user?.handle}
                examples={EXAMPLE_PROMPTS}
              />
            </div>
          </div>
        </div>

        {/* Service strip */}
        <div
          className="mt-10 flex flex-wrap items-center justify-center gap-2"
          style={{ animation: 'fade-up 0.7s ease-out 0.8s both' }}
        >
          {DOMAINS.map(d => (
            <div
              key={d.title}
              className="flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50/60 px-3 py-1.5 text-xs text-slate-600 backdrop-blur-sm"
            >
              <d.icon className={`h-3 w-3 ${d.color}`} />
              {d.title}
            </div>
          ))}
        </div>
      </section>

      {/* ── Domains ── */}
      <section className="relative px-6 pb-28 sm:px-10">
        <div className="mb-14 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground/60 mb-3">Every domain of human intent</p>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-foreground">
            One place. <span className="gradient-text-brand">Every need.</span>
          </h2>
        </div>

        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          {DOMAINS.map(d => (
            <div
              key={d.title}
              className={`group glass glass-hover rounded-2xl p-5 transition-all duration-300 border border-transparent ${d.border} hover:shadow-lg ${d.glow} cursor-default`}
            >
              <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl ${d.iconBg} transition-transform duration-300 group-hover:scale-110`}>
                <d.icon className={`h-5 w-5 ${d.color}`} />
              </div>
              <h3 className="mb-1 text-sm font-semibold text-foreground">{d.title}</h3>
              <p className="text-[11px] leading-relaxed text-muted-foreground">{d.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="relative px-6 pb-28 sm:px-10">
        <div className="mb-14 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground/60 mb-3">Simple by design</p>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            How it <span className="gradient-text-brand">works</span>
          </h2>
        </div>

        <div className="mx-auto max-w-4xl">
          <div className="grid gap-4 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <div key={s.num} className="relative">
                {/* Connector line on desktop */}
                {i < 2 && (
                  <div className="pointer-events-none absolute -right-2 top-10 hidden h-px w-4 sm:block"
                    style={{ background: 'linear-gradient(90deg, rgba(139,92,246,0.35), rgba(139,92,246,0.05))' }}
                  />
                )}
                <div className="glass glass-hover rounded-2xl p-7 h-full transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
                  {/* Step number */}
                  <div
                    className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-full text-sm font-black text-violet-300"
                    style={{
                      background: 'linear-gradient(135deg, rgba(139,92,246,0.2) 0%, rgba(34,211,238,0.1) 100%)',
                      border: '1px solid rgba(139,92,246,0.25)',
                    }}
                  >
                    {s.num}
                  </div>
                  <h3 className="mb-2.5 text-base font-semibold text-foreground">{s.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="relative px-6 pb-28 sm:px-10">
        <div className="mb-14 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground/60 mb-3">Built different</p>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Why <span className="gradient-text-brand">Smart Search</span>
          </h2>
        </div>

        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          {FEATURES.map(f => (
            <div
              key={f.title}
              className="glass glass-hover rounded-2xl p-8 transition-all duration-300 card-hover"
            >
              <div className={`mb-5 flex h-13 w-13 items-center justify-center rounded-2xl ${f.iconBg} transition-transform duration-300 hover:scale-110`}
                style={{ height: 52, width: 52 }}
              >
                <f.icon className={`h-6 w-6 ${f.color}`} />
              </div>
              <h3 className="mb-3 text-base font-semibold text-foreground">{f.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA strip ── */}
      <section className="relative px-6 pb-28 sm:px-10">
        <div
          className="mx-auto max-w-2xl rounded-3xl p-px"
          style={{ background: 'linear-gradient(135deg, rgba(37,99,235,0.3), rgba(14,165,233,0.15), rgba(37,99,235,0.1))' }}
        >
          <div className="glass rounded-3xl px-10 py-12 text-center">
            <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
              Ready to <span className="gradient-text">try it?</span>
            </h2>
            <p className="mb-8 text-base text-muted-foreground">
              Type your first intent above — no account needed to start.
            </p>
            <div className="flex items-center justify-center gap-3">
              {!user && (
                <a
                  href="/signup"
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:bg-primary/90 hover:shadow-blue-500/30 hover:scale-[1.02]"
                >
                  <Sparkles className="h-4 w-4" />
                  Create your account
                </a>
              )}
              <a
                href="/#search"
                className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-6 py-2.5 text-sm font-medium text-blue-700 transition-all hover:bg-blue-100 hover:text-blue-800"
              >
                Try a prompt
                <ArrowRight className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="relative border-t border-blue-100 py-10 px-8">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-blue-500/20 to-sky-400/15 ring-1 ring-blue-200">
              <Sparkles className="h-3 w-3 text-blue-500" />
            </div>
            <span className="gradient-text-brand text-sm font-bold">Smart Search</span>
            <span className="text-xs text-muted-foreground/60">· Intent Operating System</span>
          </div>
          <p className="text-xs text-muted-foreground/50">
            Payment never creates relevance. Built with intent.
          </p>
        </div>
      </footer>
    </div>
  )
}
