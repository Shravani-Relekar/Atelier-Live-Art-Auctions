import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Artist, Lot, LotImage } from "@/lib/types";
import { lifespan } from "@/lib/format";
import { ArtImage } from "@/components/ArtImage";
import { LotCard } from "@/components/LotCard";
import { ErrorState, PageLoader } from "@/components/common";
import { useLotSubscriptions } from "@/hooks/useRealtime";

type ArtistListItem = Artist & { lotCount: number; coverImage: LotImage | null };

export function ArtistsPage() {
  const { data, isLoading } = useQuery({ queryKey: ["artists"], queryFn: () => api.get<{ artists: ArtistListItem[] }>("/artists") });
  return (
    <div className="container-x py-14">
      <p className="eyebrow">Artists</p>
      <h1 className="mt-2 text-5xl md:text-6xl">Our artists</h1>
      <div className="mt-12 grid grid-cols-2 gap-x-6 gap-y-12 md:grid-cols-3 lg:grid-cols-4">
        {isLoading && Array.from({ length: 8 }, (_, i) => <div key={i} className="aspect-square animate-pulse bg-paper-deep" />)}
        {data?.artists.map((a) => (
          <Link key={a.id} to={`/artists/${a.slug}`} className="group">
            <div className="aspect-square bg-paper-deep p-6 transition group-hover:bg-[#e9e1d2]">
              <ArtImage image={a.coverImage} width={500} className="h-full w-full bg-transparent" />
            </div>
            <h2 className="mt-4 text-2xl group-hover:text-gold-dark">{a.name}</h2>
            <p className="text-sm text-ink-muted">{a.country} · {lifespan(a.born, a.died)} · {a.lotCount} lot{a.lotCount === 1 ? "" : "s"}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function ArtistDetailPage() {
  const { slug } = useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ["artist", slug],
    queryFn: () => api.get<{ artist: Artist; lots: Lot[] }>(`/artists/${slug}`),
  });
  useLotSubscriptions(data?.lots.filter((l) => l.status === "LIVE").map((l) => l.id) ?? []);
  if (isLoading) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} />;
  const { artist, lots } = data;
  return (
    <div className="container-x py-14">
      <p className="eyebrow">Artist</p>
      <h1 className="mt-2 text-5xl md:text-7xl">{artist.name}</h1>
      <p className="mt-2 text-ink-muted">{artist.country} · {lifespan(artist.born, artist.died)}</p>
      {artist.bio && <p className="mt-8 max-w-3xl text-lg leading-relaxed text-ink-soft">{artist.bio}</p>}
      <h2 className="mt-16 text-3xl">Works at auction</h2>
      <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-12 md:grid-cols-3 xl:grid-cols-4">
        {lots.map((l) => <LotCard key={l.id} lot={l} showAuction />)}
      </div>
    </div>
  );
}
