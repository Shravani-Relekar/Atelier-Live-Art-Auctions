/* eslint-disable no-console */
import "dotenv/config";
import { PrismaClient, type ImageProvider, type LotStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { v2 as cloudinary } from "cloudinary";
import { incrementFor } from "../src/lib/increments";

const prisma = new PrismaClient();

const cloudinaryOn = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET,
);
const uploadSeedImages = cloudinaryOn && process.env.SEED_UPLOAD_TO_CLOUDINARY === "true";
if (cloudinaryOn) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

// All artworks are in the public domain; images are served from Wikimedia Commons.
const WM = "https://upload.wikimedia.org/wikipedia/commons";
const WMT = "https://thumb.wikimedia.org/wikipedia/commons/thumb";

const artists = {
  varma: { name: "Raja Ravi Varma", born: 1848, died: 1906, country: "India", bio: "Celebrated for fusing European academic realism with Indian subjects and mythology, Ravi Varma brought oil painting and the lithographic print to a vast Indian audience." },
  shergil: { name: "Amrita Sher-Gil", born: 1913, died: 1941, country: "India", bio: "Trained in Paris and returning to India in 1934, Sher-Gil forged a modern idiom of muted colour and monumental figures that made her a founding voice of Indian modernism." },
  tagore: { name: "Abanindranath Tagore", born: 1871, died: 1951, country: "India", bio: "Principal artist of the Bengal School, Tagore championed wash techniques and Mughal and Rajput precedents as an alternative to colonial art education." },
  monet: { name: "Claude Monet", born: 1840, died: 1926, country: "France", bio: "Founder of Impressionism whose late cycles of water lilies at Giverny dissolve form into light and reflection." },
  vangogh: { name: "Vincent van Gogh", born: 1853, died: 1890, country: "Netherlands", bio: "Post-Impressionist whose expressive brushwork and saturated colour, compressed into a single decade, reshaped modern painting." },
  klimt: { name: "Gustav Klimt", born: 1862, died: 1918, country: "Austria", bio: "Leading figure of the Vienna Secession, known for ornamental surfaces, gold leaf and luminous landscapes." },
  hokusai: { name: "Katsushika Hokusai", born: 1760, died: 1849, country: "Japan", bio: "Ukiyo-e master of the Edo period whose woodblock series transformed Japanese landscape printmaking and inspired European Japonisme." },
} as const;
type ArtistKey = keyof typeof artists;

interface SeedLot {
  artist: ArtistKey;
  title: string;
  year: string;
  medium: string;
  dimensions: string;
  est: [number, number];
  reserve?: number;
  image: { url: string; w: number; h: number };
  description: string;
}

const catalogue: Record<"indian" | "european" | "evening" | "past", SeedLot[]> = {
  indian: [
    { artist: "varma", title: "Galaxy of Musicians", year: "c. 1889", medium: "Oil on canvas", dimensions: "110 x 140 cm", est: [80_000_000, 120_000_000], reserve: 75_000_000,
      image: { url: `${WM}/f/f6/Raja_Ravi_Varma%2C_Galaxy_of_Musicians.jpg`, w: 800, h: 628 },
      description: "Eleven women musicians from across the subcontinent, each in regional dress and holding a distinct instrument — an ambitious statement of a shared cultural identity." },
    { artist: "varma", title: "Reclining Woman", year: "c. 1890s", medium: "Oil on canvas", dimensions: "92 x 130 cm", est: [45_000_000, 65_000_000], reserve: 42_000_000,
      image: { url: `${WMT}/5/59/Raja_Ravi_Varma%2C_Reclining_Woman.jpg/1920px-Raja_Ravi_Varma%2C_Reclining_Woman.jpg`, w: 4024, h: 2840 },
      description: "An intimate, softly lit interior study demonstrating the artist's command of drapery, skin tone and academic composition." },
    { artist: "shergil", title: "South Indian Villagers Going to Market", year: "1937", medium: "Oil on canvas", dimensions: "145 x 88 cm", est: [180_000_000, 250_000_000], reserve: 170_000_000,
      image: { url: `${WMT}/5/53/Amrita_Sher-Gil_painting_South_Indian_Villagers_Going_to_Market_1937_Simla.jpg/1920px-Amrita_Sher-Gil_painting_South_Indian_Villagers_Going_to_Market_1937_Simla.jpg`, w: 3024, h: 2618 },
      description: "Painted after her southern journey of 1937, the work's flattened planes and earthy palette mark the artist's turn towards Ajanta and Indian miniature traditions." },
    { artist: "shergil", title: "Portrait of Yusuf Ali Khan", year: "1931", medium: "Oil on canvas", dimensions: "64 x 54 cm", est: [35_000_000, 50_000_000],
      image: { url: `${WM}/b/b3/Yusuf_Ali_Khan_by_Amrita_Sher-Gil_1931.jpg`, w: 1025, h: 1200 },
      description: "An early Paris-period portrait, confidently modelled, showing the young painter's absorption of post-impressionist portraiture." },
    { artist: "tagore", title: "White Peacock", year: "1915–16", medium: "Wash and tempera on paper", dimensions: "28 x 40 cm", est: [12_000_000, 18_000_000], reserve: 11_000_000,
      image: { url: `${WM}/f/f9/Abanindranath_Tagore_-_White_Peacock%2C_1915-16.jpg`, w: 1698, h: 1178 },
      description: "A lyrical study in the Japanese-influenced wash technique the artist developed with his Bengal School circle." },
    { artist: "tagore", title: "Village Music", year: "1926–27", medium: "Watercolour on paper", dimensions: "30 x 41 cm", est: [8_000_000, 12_000_000],
      image: { url: `${WM}/c/c9/Abanindranath_Tagore_-_Village_Music%2C_1926-27.jpg`, w: 1656, h: 1207 },
      description: "A gentle rural scene from the artist's mature period, rendered in layered transparent washes." },
  ],
  european: [
    { artist: "monet", title: "Nymphéas (Water Lilies)", year: "c. 1915", medium: "Oil on canvas", dimensions: "150 x 197 cm", est: [1_200_000_000, 1_600_000_000], reserve: 1_150_000_000,
      image: { url: `${WMT}/e/e1/Claude_Monet_-_Seerosen.jpg/1920px-Claude_Monet_-_Seerosen.jpg`, w: 3704, h: 2745 },
      description: "From the Giverny cycle: the horizon disappears and the pond's surface becomes the entire picture plane." },
    { artist: "monet", title: "Water-Lily Pond and Weeping Willow", year: "1916–19", medium: "Oil on canvas", dimensions: "100 x 107 cm", est: [650_000_000, 900_000_000],
      image: { url: `${WM}/1/10/Claude_Monet%2C_Water-Lily_Pond_and_Weeping_Willow.JPG`, w: 1309, h: 1215 },
      description: "Dense, gestural late handling with the willow's fronds sweeping across reflected sky." },
    { artist: "vangogh", title: "Enclosed Field with Ploughman", year: "1889", medium: "Oil on canvas", dimensions: "54 x 65 cm", est: [900_000_000, 1_300_000_000], reserve: 880_000_000,
      image: { url: `${WMT}/b/b2/Vincent_van_Gogh_-_Enclosed_Field_with_Ploughman_-_Google_Art_Project.jpg/1920px-Vincent_van_Gogh_-_Enclosed_Field_with_Ploughman_-_Google_Art_Project.jpg`, w: 4742, h: 3883 },
      description: "Painted from the window of his room at Saint-Rémy, a recurring motif the artist returned to across the seasons." },
    { artist: "vangogh", title: "Portrait of Dr Paul Gachet", year: "1890", medium: "Oil on canvas", dimensions: "68 x 57 cm", est: [1_500_000_000, 1_900_000_000],
      image: { url: `${WMT}/3/3c/Vincent_van_Gogh_-_Dr_Paul_Gachet_-_Google_Art_Project.jpg/1920px-Vincent_van_Gogh_-_Dr_Paul_Gachet_-_Google_Art_Project.jpg`, w: 5611, h: 6748 },
      description: "The physician who cared for the artist in Auvers, posed in a melancholic attitude against a deep blue ground." },
    { artist: "klimt", title: "Beech Grove I", year: "1902", medium: "Oil on canvas", dimensions: "100 x 100 cm", est: [700_000_000, 950_000_000],
      image: { url: `${WMT}/a/a3/Gustav_Klimt_-_Beech_Grove_I_-_Google_Art_Project.jpg/1920px-Gustav_Klimt_-_Beech_Grove_I_-_Google_Art_Project.jpg`, w: 3422, h: 3396 },
      description: "A square-format landscape in which tree trunks become a rhythmic, almost textile pattern." },
    { artist: "klimt", title: "Hope II", year: "1907–08", medium: "Oil, gold and platinum on canvas", dimensions: "110 x 110 cm", est: [1_100_000_000, 1_500_000_000], reserve: 1_050_000_000,
      image: { url: `${WMT}/7/7c/Gustav_Klimt_-_Hope%2C_II_-_Google_Art_Project.jpg/1920px-Gustav_Klimt_-_Hope%2C_II_-_Google_Art_Project.jpg`, w: 3648, h: 3699 },
      description: "A golden-period meditation on life and mortality, its mosaic-like robe shimmering with metallic leaf." },
  ],
  evening: [
    { artist: "vangogh", title: "The Starry Night", year: "1889", medium: "Oil on canvas", dimensions: "74 x 92 cm", est: [1_700_000_000, 1_990_000_000], reserve: 1_650_000_000,
      image: { url: `${WMT}/0/01/Vincent_van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg/1920px-Vincent_van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg`, w: 4331, h: 3346 },
      description: "A swirling nocturne over Saint-Rémy, among the most recognised images in Western art. (Demonstration lot.)" },
    { artist: "klimt", title: "The Kiss", year: "1907–08", medium: "Oil and gold leaf on canvas", dimensions: "180 x 180 cm", est: [1_600_000_000, 1_950_000_000],
      image: { url: `${WMT}/4/40/The_Kiss_-_Gustav_Klimt_-_Google_Cultural_Institute.jpg/1920px-The_Kiss_-_Gustav_Klimt_-_Google_Cultural_Institute.jpg`, w: 7376, h: 7401 },
      description: "The apex of Klimt's golden period, two lovers enveloped in ornamented robes. (Demonstration lot.)" },
    { artist: "hokusai", title: "The Great Wave off Kanagawa", year: "c. 1831", medium: "Woodblock print; ink and colour on paper", dimensions: "25.7 x 37.9 cm", est: [25_000_000, 40_000_000],
      image: { url: `${WMT}/a/a5/Tsunami_by_hokusai_19th_century.jpg/1920px-Tsunami_by_hokusai_19th_century.jpg`, w: 3859, h: 2594 },
      description: "From the series Thirty-six Views of Mount Fuji: a vivid early impression with strong Prussian blue." },
  ],
  past: [
    { artist: "varma", title: "Woman Holding a Fan", year: "c. 1895", medium: "Oil on canvas", dimensions: "76 x 51 cm", est: [30_000_000, 45_000_000],
      image: { url: `${WM}/b/bf/Raja_Ravi_Varma_-_Woman_Holding_a_Fan_VA_AC_2006AU7185.jpg`, w: 539, h: 800 },
      description: "A poised single-figure composition typical of the artist's celebrated portraits of women." },
    { artist: "shergil", title: "Vase of Flowers", year: "1933", medium: "Oil on canvas", dimensions: "61 x 50 cm", est: [20_000_000, 30_000_000], reserve: 20_000_000,
      image: { url: `${WM}/2/2a/Vase_of_Flowers_by_Amrita_Sher-Gil%2C_1933.jpg`, w: 541, h: 585 },
      description: "A rare still life from the Paris years, loose and confident in its handling." },
    { artist: "tagore", title: "Santhal Girl, Ranchi", year: "c. 1930s", medium: "Watercolour on paper", dimensions: "35 x 25 cm", est: [6_000_000, 9_000_000],
      image: { url: `${WM}/7/78/Abanindranath_Tagore_-_Santhal_Girl%2C_Ranchi.jpg`, w: 1186, h: 1685 },
      description: "A tender portrait study made during the artist's stay in Ranchi." },
  ],
};

const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_-]+/g, "-");
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

async function resolveImage(img: SeedLot["image"], folder: string): Promise<{ provider: ImageProvider; url: string; publicId: string | null; width: number; height: number }> {
  if (uploadSeedImages) {
    try {
      const r = await cloudinary.uploader.upload(img.url, { folder, resource_type: "image" });
      return { provider: "CLOUDINARY", url: r.secure_url, publicId: r.public_id, width: r.width, height: r.height };
    } catch (e) {
      console.warn(`  ! Cloudinary upload failed for ${img.url}, using remote URL`, (e as Error).message);
    }
  }
  return { provider: "EXTERNAL", url: img.url, publicId: null, width: img.w, height: img.h };
}

async function main() {
  console.log("Resetting data…");
  await prisma.$transaction([
    prisma.watchlist.deleteMany(),
    prisma.autoBid.deleteMany(),
    prisma.bid.deleteMany(),
    prisma.lotImage.deleteMany(),
    prisma.lot.deleteMany(),
    prisma.auction.deleteMany(),
    prisma.artist.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  console.log("Creating users…");
  const adminHash = await bcrypt.hash("Admin@12345", 12);
  const bidderHash = await bcrypt.hash("Bidder@123", 12);
  const admin = await prisma.user.create({ data: { email: "admin@atelier.test", name: "Atelier Admin", role: "ADMIN", passwordHash: adminHash } });
  const bidders = await Promise.all(
    [
      ["asha@atelier.test", "Asha Menon", "India"],
      ["rohan@atelier.test", "Rohan Kapoor", "India"],
      ["clara@atelier.test", "Clara Weiss", "Germany"],
      ["omar@atelier.test", "Omar Haddad", "UAE"],
    ].map(([email, name, country]) => prisma.user.create({ data: { email, name, country, passwordHash: bidderHash } })),
  );

  console.log("Creating artists…");
  const artistIds = {} as Record<ArtistKey, string>;
  for (const [key, a] of Object.entries(artists) as Array<[ArtistKey, (typeof artists)[ArtistKey]]>) {
    const created = await prisma.artist.create({ data: { ...a, slug: slugify(a.name) } });
    artistIds[key] = created.id;
  }

  const now = Date.now();
  const auctions = [
    { key: "indian" as const, title: "Indian Modernists: Live Online Auction", subtitle: "Masterpieces of the Bengal School and beyond", currency: "INR",
      startsAt: new Date(now - 2 * DAY), endsAt: new Date(now + 45 * MIN), interval: 180, status: "LIVE" as const },
    { key: "european" as const, title: "Impressionism & the Vienna Secession", subtitle: "Giverny, Saint-Rémy and the golden period", currency: "INR",
      startsAt: new Date(now - DAY), endsAt: new Date(now + 6 * MIN), interval: 120, status: "LIVE" as const },
    { key: "evening" as const, title: "The Masterworks Evening Sale", subtitle: "A demonstration catalogue of icons", currency: "INR",
      startsAt: new Date(now + DAY), endsAt: new Date(now + 3 * DAY), interval: 300, status: "UPCOMING" as const },
    { key: "past" as const, title: "Spring Online Sale", subtitle: "Works on canvas and paper", currency: "INR",
      startsAt: new Date(now - 30 * DAY), endsAt: new Date(now - 25 * DAY), interval: 120, status: "CLOSED" as const },
  ];

  for (const a of auctions) {
    console.log(`Creating auction "${a.title}"…`);
    const lotsData = catalogue[a.key];
    const firstImage = lotsData[0].image.url;
    const auction = await prisma.auction.create({
      data: {
        slug: slugify(a.title),
        title: a.title,
        subtitle: a.subtitle,
        description:
          "Each lot closes in sequence. A bid placed in the final two minutes extends that lot's close by two minutes, so every bidder has a fair chance to respond. A buyer's premium applies to the hammer price.",
        currency: a.currency,
        coverImage: firstImage,
        status: a.status,
        startsAt: a.startsAt,
        endsAt: a.endsAt,
        lotIntervalSeconds: a.interval,
      },
    });

    for (let i = 0; i < lotsData.length; i++) {
      const l = lotsData[i];
      const lotNumber = i + 1;
      const endsAt = new Date(a.endsAt.getTime() + i * a.interval * 1000);
      const startingBid = roundToIncrement(Math.round(l.est[0] * 0.6));
      const image = await resolveImage(l.image, `${process.env.CLOUDINARY_UPLOAD_FOLDER ?? "atelier/lots"}/seed`);

      // Simulated bidding history for live and past lots.
      const bidHistory: Array<{ userId: string; amount: number; at: Date }> = [];
      if (a.status !== "UPCOMING") {
        const targetBids = a.status === "CLOSED" ? 6 + (i % 4) : 2 + ((i * 3) % 5);
        let amount = startingBid;
        let t = a.startsAt.getTime() + HOUR;
        let lastBidder = -1;
        for (let b = 0; b < targetBids; b++) {
          let who = (b + i) % bidders.length;
          if (who === lastBidder) who = (who + 1) % bidders.length;
          bidHistory.push({ userId: bidders[who].id, amount, at: new Date(t) });
          lastBidder = who;
          amount += incrementFor(amount) * (1 + (b % 3));
          t += 37 * MIN;
        }
      }
      const top = bidHistory[bidHistory.length - 1];
      let status: LotStatus = a.status === "LIVE" ? "LIVE" : a.status === "UPCOMING" ? "UPCOMING" : "PASSED";
      if (a.status === "CLOSED" && top) status = l.reserve == null || top.amount >= l.reserve ? "SOLD" : "PASSED";

      await prisma.lot.create({
        data: {
          auctionId: auction.id,
          lotNumber,
          title: l.title,
          artistId: artistIds[l.artist],
          year: l.year,
          medium: l.medium,
          dimensions: l.dimensions,
          signature: "Unsigned",
          description: l.description,
          provenance: "Public-domain image courtesy of Wikimedia Commons. Lot offered for demonstration purposes only.",
          estimateLow: l.est[0],
          estimateHigh: l.est[1],
          startingBid,
          reservePrice: l.reserve,
          currentBid: top?.amount ?? null,
          highestBidderId: top?.userId ?? null,
          bidCount: bidHistory.length,
          status,
          startsAt: a.startsAt,
          endsAt,
          closedAt: a.status === "CLOSED" ? endsAt : null,
          images: { create: [{ ...image, position: 0, alt: `${l.title} by ${artists[l.artist].name}` }] },
          bids: { create: bidHistory.map((b) => ({ userId: b.userId, amount: b.amount, createdAt: b.at })) },
        },
      });
    }
  }

  console.log("\nSeed complete.");
  console.log("  Admin:   admin@atelier.test / Admin@12345");
  console.log("  Bidders: asha@ | rohan@ | clara@ | omar@atelier.test / Bidder@123");
  console.log(`  Images:  ${uploadSeedImages ? "uploaded to Cloudinary" : "remote Wikimedia URLs (set SEED_UPLOAD_TO_CLOUDINARY=true to upload)"}`);
  console.log("  Note:    live auctions close relative to seed time — re-run `npm run db:seed` to reset the clock.");
  void admin;
}

function roundToIncrement(n: number) {
  const inc = incrementFor(n);
  return Math.max(inc, Math.round(n / inc) * inc);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
