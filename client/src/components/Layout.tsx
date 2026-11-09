import { useEffect, useState, type FormEvent } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import { Gavel, Globe2, Instagram, LogOut, Menu, ShieldCheck, Truck, User as UserIcon, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { getSocket } from "@/lib/socket";
import { money } from "@/lib/format";
import { useRealtimeBridge } from "@/hooks/useRealtime";

const NAV = [
  { to: "/auctions", label: "Auctions" },
  { to: "/auctions?tab=upcoming", label: "Upcoming" },
  { to: "/auctions?tab=past", label: "Results" },
  { to: "/artists", label: "Artists" },
  { to: "/how-to-bid", label: "How to Bid" },
];

export function Layout() {
  useRealtimeBridge();
  useUserNotifications();
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

function Header() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setOpen(false);
  }, [location]);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={clsx("sticky top-0 z-50 border-b bg-paper/95 backdrop-blur transition", scrolled ? "border-ink/10" : "border-transparent")}>
      <div className="bg-ink text-paper">
        <div className="container-x flex h-8 items-center justify-between text-[11px] uppercase tracking-[0.2em]">
          <span className="truncate">Authenticity guaranteed · Worldwide shipping</span>
          <span className="hidden sm:inline">Live online auctions</span>
        </div>
      </div>
      <div className="container-x flex h-[72px] items-center justify-between gap-6">
        <Link to="/" className="flex items-baseline gap-2" aria-label="Atelier home">
          <span className="font-display text-3xl font-semibold tracking-[0.08em]">ATELIER</span>
          <span className="hidden text-[10px] uppercase tracking-widest2 text-gold sm:inline">Auctions</span>
        </Link>

        <nav className="hidden items-center gap-6 whitespace-nowrap xl:flex xl:gap-7">
          {NAV.map((n) => (
            <NavLink key={n.label} to={n.to} className={({ isActive }) => clsx("text-[13px] uppercase tracking-[0.16em] transition hover:text-gold", isActive && n.to === location.pathname + location.search ? "text-gold" : "text-ink")}>
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden items-center gap-3 whitespace-nowrap xl:flex">
          {user ? (
            <>
              {user.role === "ADMIN" && <Link to="/admin" className="btn-ghost">Admin</Link>}
              <Link to="/account" className="flex items-center gap-2 text-sm hover:text-gold">
                <UserIcon className="h-4 w-4" />
                <span className="max-w-[10rem] truncate">{user.name.split(" ")[0]}</span>
                <span className="text-xs text-ink-muted">#{user.paddle}</span>
              </Link>
              <button onClick={() => logout().then(() => navigate("/"))} className="btn-ghost" aria-label="Log out"><LogOut className="h-4 w-4" /></button>
            </>
          ) : (
            <>
              <Link to="/login" state={{ from: location.pathname }} className="btn-ghost">Log in</Link>
              <Link to="/register" className="btn-primary px-4 py-2.5">Register to bid</Link>
            </>
          )}
        </div>

        <button className="p-2 xl:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menu" aria-expanded={open}>
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.nav initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-ink/10 bg-paper xl:hidden">
            <div className="container-x flex flex-col py-4">
              {NAV.map((n) => (
                <Link key={n.label} to={n.to} className="border-b border-ink/5 py-3 text-sm uppercase tracking-[0.16em]">{n.label}</Link>
              ))}
              {user ? (
                <>
                  <Link to="/account" className="border-b border-ink/5 py-3 text-sm uppercase tracking-[0.16em]">My account · #{user.paddle}</Link>
                  {user.role === "ADMIN" && <Link to="/admin" className="border-b border-ink/5 py-3 text-sm uppercase tracking-[0.16em]">Admin</Link>}
                  <button onClick={() => logout()} className="py-3 text-left text-sm uppercase tracking-[0.16em] text-ink-muted">Log out</button>
                </>
              ) : (
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <Link to="/login" className="btn-outline">Log in</Link>
                  <Link to="/register" className="btn-primary">Register</Link>
                </div>
              )}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}

export function TrustBar() {
  const items = [
    { icon: ShieldCheck, title: "Authenticity Guarantee", body: "Every lot is vetted by our specialists, with provenance documented." },
    { icon: Gavel, title: "Bid live or set a maximum", body: "Bid in real time, or leave a maximum and we'll bid for you." },
    { icon: Truck, title: "International Shipping", body: "Insured, climate-aware fine-art shipping to over 60 countries." },
  ];
  return (
    <section className="border-y border-ink/10 bg-paper-card">
      <div className="container-x grid gap-8 py-12 md:grid-cols-3">
        {items.map(({ icon: I, title, body }) => (
          <div key={title} className="flex gap-4">
            <I className="h-8 w-8 shrink-0 text-gold" strokeWidth={1.25} />
            <div>
              <h3 className="text-xl">{title}</h3>
              <p className="mt-1 text-sm text-ink-muted">{body}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Footer() {
  const [email, setEmail] = useState("");
  const toast = useToast();
  const subscribe = (e: FormEvent) => {
    e.preventDefault();
    setEmail("");
    toast({ tone: "success", title: "Subscribed", body: "You'll hear about new sales first." });
  };
  return (
    <footer className="mt-24 bg-ink text-paper/80">
      <div className="container-x grid gap-12 py-16 md:grid-cols-12">
        <div className="md:col-span-4">
          <div className="font-display text-3xl font-semibold tracking-[0.08em] text-paper">ATELIER</div>
          <p className="mt-4 max-w-sm text-sm leading-relaxed">
            An online auction house for modern and classical painting. Transparent estimates, live bidding and specialist care from consignment to delivery.
          </p>
        </div>
        <div className="md:col-span-2">
          <h4 className="eyebrow text-paper/50">Quick links</h4>
          <ul className="mt-4 space-y-2 text-sm">
            <li><Link to="/auctions" className="hover:text-gold-light">Current auctions</Link></li>
            <li><Link to="/auctions?tab=upcoming" className="hover:text-gold-light">Upcoming</Link></li>
            <li><Link to="/auctions?tab=past" className="hover:text-gold-light">Past results</Link></li>
            <li><Link to="/artists" className="hover:text-gold-light">Artists</Link></li>
          </ul>
        </div>
        <div className="md:col-span-2">
          <h4 className="eyebrow text-paper/50">Buying</h4>
          <ul className="mt-4 space-y-2 text-sm">
            <li><Link to="/how-to-bid" className="hover:text-gold-light">How to bid</Link></li>
            <li><Link to="/how-to-bid#premium" className="hover:text-gold-light">Buyer's premium</Link></li>
            <li><Link to="/account" className="hover:text-gold-light">My bids</Link></li>
          </ul>
        </div>
        <div className="md:col-span-4">
          <h4 className="eyebrow text-paper/50">Subscribe</h4>
          <p className="mt-4 text-sm">Catalogues and sale previews, straight to your inbox.</p>
          <form onSubmit={subscribe} className="mt-4 flex">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" className="min-w-0 flex-1 border border-paper/20 bg-transparent px-4 py-3 text-sm text-paper outline-none placeholder:text-paper/40 focus:border-gold" />
            <button className="bg-gold px-5 text-xs font-medium uppercase tracking-[0.16em] text-white hover:bg-gold-dark">Join</button>
          </form>
          <div className="mt-6 flex gap-4 text-paper/60">
            <Instagram className="h-5 w-5" />
            <Globe2 className="h-5 w-5" />
          </div>
        </div>
      </div>
      <div className="border-t border-paper/10">
        <div className="container-x flex flex-col justify-between gap-2 py-6 text-xs text-paper/50 sm:flex-row">
          <span>© {new Date().getFullYear()} Atelier Auctions. Demonstration platform.</span>
          <span>Artwork images: public domain via Wikimedia Commons.</span>
        </div>
      </div>
    </footer>
  );
}

/** Outbid / won notifications pushed to the user's private socket room. */
function useUserNotifications() {
  const toast = useToast();
  const { user } = useAuth();
  useEffect(() => {
    if (!user) return;
    const s = getSocket();
    const onOutbid = (e: { lotId: string; currentBid: number; nextMinBid: number }) =>
      toast({ tone: "outbid", title: "You've been outbid", body: `Current bid ${money(e.currentBid)} — bid ${money(e.nextMinBid)} to retake the lead.`, href: `/lots/${e.lotId}` });
    const onWon = (e: { lotId: string; amount: number }) =>
      toast({ tone: "success", title: "Congratulations — you won!", body: `Hammer price ${money(e.amount)}.`, href: `/lots/${e.lotId}` });
    s.on("user:outbid", onOutbid);
    s.on("user:won", onWon);
    return () => {
      s.off("user:outbid", onOutbid);
      s.off("user:won", onWon);
    };
  }, [user, toast]);
}
