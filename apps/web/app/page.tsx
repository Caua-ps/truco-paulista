import Link from 'next/link';
import { Navbar } from '@/components/Navbar';
import { ViraDemo } from '@/components/ViraDemo';
import {
  IconLink,
  IconMessageCircle,
  IconShieldCheck,
  IconSmartphone,
  IconTrophy,
  IconUser,
  IconUsers,
  IconZap,
} from '@/components/icons';

const MODES = [
  { Icon: IconUser, title: '1 x 1', text: 'Mano a mano. Só você, três cartas e a coragem de pedir seis sem nada na mão.' },
  { Icon: IconUsers, title: '2 x 2', text: 'Em dupla, como manda a tradição. O sinal pro parceiro fica por conta do chat.' },
  { Icon: IconTrophy, title: 'Ranqueada', text: 'Rating, temporadas e ranking global, semanal e mensal. Prove que a mesa é sua.' },
  { Icon: IconLink, title: 'Entre amigos', text: 'Mesa privada com link de convite: quem clicar cai sentado na sua mesa.' },
];

const STEPS = [
  { n: 'I', title: 'Crie sua conta', text: 'Leva 30 segundos — ou entre direto com o Google.' },
  { n: 'II', title: 'Escolha a mesa', text: 'Matchmaking automático ou mesa privada com link pros amigos.' },
  { n: 'III', title: 'Grite truco', text: 'Vira na mesa, manilha definida, melhor de três valendo 12.' },
];

const FEATURES = [
  {
    Icon: IconZap,
    title: 'Tempo real de verdade',
    text: 'Arraste a carta e ela bate na mesa de todo mundo no mesmo instante. Caiu a conexão? Você tem 60 segundos para voltar e o jogo continua de onde parou.',
  },
  {
    Icon: IconShieldCheck,
    title: 'Jogo limpo, sempre',
    text: 'Suas cartas vivem no servidor — ninguém enxerga a sua mão, nem com programa modificado. Toda partida fica registrada lance a lance.',
  },
  {
    Icon: IconMessageCircle,
    title: 'Mesa com zoeira',
    text: 'Chat e emojis rápidos durante a partida, com som de carta batendo e buzina de truco. O deboche faz parte do jogo.',
  },
  {
    Icon: IconSmartphone,
    title: 'Joga em qualquer tela',
    text: 'No navegador do PC, tablet ou celular, com cartas que você arrasta com o dedo — e em breve nos aplicativos para Android e iOS.',
  },
];

const RULE_CHIPS = [
  'Baralho de 40 cartas',
  'A vira define a manilha',
  'Melhor de 3 rodadas',
  'Truco · Seis · Nove · Doze',
  'Primeiro a fazer 12',
];

const SHOUTS = ['TRUCO', 'SEIS', 'NOVE', 'DOZE', 'MELOU', 'MÃO DE ONZE'];

export default function LandingPage() {
  return (
    <>
      <Navbar />
      <main className="relative overflow-hidden">
        {/* Atmosfera: glows e naipes esmaecidos */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-gold/10 blur-3xl" />
          <div className="absolute right-[-220px] top-[420px] h-[420px] w-[420px] rounded-full bg-felt/40 blur-3xl" />
          <div className="absolute left-[-180px] top-[900px] h-[380px] w-[380px] rounded-full bg-gold/5 blur-3xl" />
          <span className="absolute left-[6%] top-36 select-none font-display text-7xl text-white/[0.04]">♠</span>
          <span className="absolute right-[10%] top-72 select-none font-display text-8xl text-red-500/[0.07]">♥</span>
          <span className="absolute left-[12%] top-[820px] select-none font-display text-8xl text-white/[0.04]">♣</span>
          <span className="absolute right-[16%] top-[1150px] select-none font-display text-7xl text-red-500/[0.07]">♦</span>
        </div>

        {/* ============================== HERO ============================== */}
        <section className="relative mx-auto grid max-w-6xl items-center gap-20 px-4 pb-28 pt-14 lg:grid-cols-2 lg:pt-24">
          <div className="text-center lg:text-left">
            <span className="inline-flex items-center gap-2.5 rounded-full border border-gold/40 bg-gold/[0.08] px-5 py-1.5 text-[13px] font-semibold uppercase tracking-[0.18em] text-gold">
              ♦ Truco Paulista, online ♦
            </span>
            <h1 className="mt-7 font-display text-5xl leading-[1.04] text-zinc-50 sm:text-6xl lg:text-7xl">
              Grita{' '}
              <em className="bg-gradient-to-r from-gold-light via-yellow-200 to-gold bg-clip-text not-italic text-transparent [font-style:italic]">
                truco
              </em>
              <br />
              de onde estiver.
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-zinc-300 lg:mx-0">
              A vira sobe, a manilha muda, e o blefe é por sua conta. Partidas 1x1 e 2x2 em tempo
              real, no navegador — desafie os amigos com um link ou enfrente o Brasil no
              matchmaking.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4 lg:justify-start">
              <Link
                href="/cadastro"
                className="btn bg-gradient-to-b from-gold-light to-gold px-10 py-4 text-lg font-bold tracking-wide text-zinc-900 shadow-[0_10px_30px_rgba(212,169,66,0.35)] hover:brightness-110 active:scale-95"
              >
                Jogar grátis
              </Link>
              <Link href="/login" className="btn-secondary px-8 py-4 text-lg">
                Já tenho conta
              </Link>
            </div>
            <p className="mt-6 text-sm tracking-wide text-zinc-400">
              grátis · direto no navegador · sem instalar nada
            </p>
          </div>

          {/* A regra central do Paulista, viva: toque no monte e o motor do jogo
              recalcula as manilhas na hora */}
          <ViraDemo />
        </section>

        {/* ===================== FAIXA DE GRITOS (marquee) ===================== */}
        <div className="relative overflow-hidden border-y border-gold/15 bg-black/40 py-2.5" aria-hidden>
          <div className="flex w-max animate-marquee items-center whitespace-nowrap font-display text-lg italic tracking-[0.2em] text-gold/35">
            {[...SHOUTS, ...SHOUTS, ...SHOUTS, ...SHOUTS].map((s, i) => (
              <span key={i} className="flex items-center">
                <span className="px-6">{s}!</span>
                <span className="text-gold/20">♦</span>
              </span>
            ))}
          </div>
        </div>

        {/* ============================ COMO FUNCIONA ============================ */}
        <section className="relative py-24">
          <div className="mx-auto max-w-5xl px-4">
            <h2 className="text-center font-display text-4xl sm:text-5xl">
              Da conta à mesa em <em className="text-gold">um minuto</em>
            </h2>
            <div className="relative mt-16 grid gap-12 sm:grid-cols-3">
              <div className="absolute left-[16%] right-[16%] top-8 hidden border-t border-dashed border-gold/25 sm:block" />
              {STEPS.map((s) => (
                <div key={s.n} className="relative text-center">
                  <span className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-gold/50 bg-black/40 font-display text-2xl italic text-gold shadow-glow backdrop-blur">
                    {s.n}
                  </span>
                  <h3 className="mt-5 font-display text-2xl text-zinc-100">{s.title}</h3>
                  <p className="mt-2 text-zinc-400">{s.text}</p>
                </div>
              ))}
            </div>

            <div className="mt-16 flex flex-wrap items-center justify-center gap-x-2 gap-y-3 text-sm text-zinc-400">
              {RULE_CHIPS.map((chip, i) => (
                <span key={chip} className="flex items-center">
                  {i > 0 && <span className="px-3 text-gold/40">♦</span>}
                  {chip}
                </span>
              ))}
            </div>
          </div>
        </section>

        <div className="gold-rule mx-auto max-w-4xl" />

        {/* ============================== MODOS ============================== */}
        <section className="relative py-24">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-center font-display text-4xl sm:text-5xl">
              Tem mesa para <em className="text-gold">todo trucador</em>
            </h2>
            <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {MODES.map((m) => (
                <div
                  key={m.title}
                  className="group relative overflow-hidden rounded-2xl border border-white/10 bg-black/25 p-7 backdrop-blur transition duration-300 hover:-translate-y-1.5 hover:border-gold/40"
                >
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/0 to-transparent transition duration-300 group-hover:via-gold/70" />
                  <m.Icon className="h-8 w-8 text-gold/80 transition-colors duration-300 group-hover:text-gold" />
                  <h3 className="mt-4 font-display text-2xl text-gold">{m.title}</h3>
                  <p className="mt-2.5 text-[15px] leading-relaxed text-zinc-400">{m.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="gold-rule mx-auto max-w-4xl" />

        {/* ============================= FEATURES ============================= */}
        <section className="relative py-24">
          <div className="mx-auto grid max-w-5xl gap-x-12 gap-y-10 px-4 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex gap-5">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-gold/40 bg-black/40 backdrop-blur">
                  <f.Icon className="h-5 w-5 text-gold" />
                </span>
                <div>
                  <h3 className="font-display text-xl text-zinc-100">{f.title}</h3>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-zinc-400">{f.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ============================== CTA FINAL ============================== */}
        <section className="relative mx-auto max-w-4xl px-4 pb-24">
          <div className="table-felt relative rounded-[2.5rem] border-8 border-wood p-12 text-center shadow-table sm:p-16">
            <div className="pointer-events-none absolute inset-3 rounded-[2rem] border border-gold/20" />
            <p className="font-display text-4xl text-gold/80">♠ ♥ ♣ ♦</p>
            <h2 className="mt-4 font-display text-5xl italic text-white">Bora trucar?</h2>
            <p className="mx-auto mt-4 max-w-md text-lg text-zinc-100/80">
              A mesa está posta e a vira já vai subir. Só falta você.
            </p>
            <Link
              href="/cadastro"
              className="btn mt-8 bg-gradient-to-b from-gold-light to-gold px-12 py-4 text-xl font-bold tracking-wide text-zinc-900 shadow-[0_10px_30px_rgba(0,0,0,0.4)] hover:brightness-110 active:scale-95"
            >
              Criar conta grátis
            </Link>
          </div>
        </section>

        <footer className="border-t border-white/5 py-10 text-center">
          <p className="font-display text-xl tracking-[0.3em] text-gold/50">♠ ♥ ♣ ♦</p>
          <p className="mt-3 text-sm text-zinc-500">
            Truco Paulista Online — feito com respeito às regras e ao deboche.
          </p>
        </footer>
      </main>
    </>
  );
}
