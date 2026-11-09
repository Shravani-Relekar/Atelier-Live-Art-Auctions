import { lazy, Suspense, useEffect } from "react";
import { Link, Route, Routes } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { PageLoader, RequireAuth } from "@/components/common";
import { useConfig } from "@/components/BidPanel";
import { setCloudName } from "@/lib/images";
import { seedClockOffset } from "@/lib/socket";
import Home from "@/pages/Home";

const Auctions = lazy(() => import("@/pages/Auctions"));
const AuctionDetail = lazy(() => import("@/pages/AuctionDetail"));
const LotDetail = lazy(() => import("@/pages/LotDetail"));
const Account = lazy(() => import("@/pages/Account"));
const Admin = lazy(() => import("@/pages/Admin"));
const HowToBid = lazy(() => import("@/pages/HowToBid"));
const ArtistsPage = lazy(() => import("@/pages/Artists").then((m) => ({ default: m.ArtistsPage })));
const ArtistDetailPage = lazy(() => import("@/pages/Artists").then((m) => ({ default: m.ArtistDetailPage })));
const LoginPage = lazy(() => import("@/pages/Auth").then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import("@/pages/Auth").then((m) => ({ default: m.RegisterPage })));

export default function App() {
  const { data: config } = useConfig();
  useEffect(() => {
    if (!config) return;
    setCloudName(config.cloudinary.cloudName);
    seedClockOffset(config.serverTime);
  }, [config]);

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="auctions" element={<Auctions />} />
          <Route path="auctions/:slug" element={<AuctionDetail />} />
          <Route path="lots/:id" element={<LotDetail />} />
          <Route path="artists" element={<ArtistsPage />} />
          <Route path="artists/:slug" element={<ArtistDetailPage />} />
          <Route path="how-to-bid" element={<HowToBid />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
          <Route path="account" element={<RequireAuth><Account /></RequireAuth>} />
          <Route path="admin" element={<RequireAuth admin><Admin /></RequireAuth>} />
          <Route
            path="*"
            element={
              <div className="container-x py-32 text-center">
                <p className="eyebrow">404</p>
                <h1 className="mt-2 text-5xl">This page has been withdrawn</h1>
                <Link to="/" className="btn-outline mt-8">Return home</Link>
              </div>
            }
          />
        </Route>
      </Routes>
    </Suspense>
  );
}
