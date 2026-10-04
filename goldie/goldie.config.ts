const APP_ROOT = "c:/Users/krish/OneDrive/Desktop/KARAGIR APP";

const config = {
  appRoot: APP_ROOT,
  bundleId: "com.karagir.app",
  devices: ["iphone-6.9"],
  locales: ["en-US"],
  appearance: "dark",
  frame: { variant: "17-pro-orange" },
  theme: {
    background: "linear-gradient(160deg, #1C120C 0%, #2A170E 40%, #0A0604 100%)",
    headlineColor: "#FFFFFF",
    subheadColor: "#D6D3D1",
    fontFamily: '-apple-system, "SF Pro Display", system-ui, sans-serif',
    copyHeightRatio: 0.22,
    deviceWidthRatio: 0.85,
    template: "editorial",
    layout: "classic"
  },
  store: {
    name: "Karagir",
    subtitle: { "en-US": "Smart Artisan Marketplace" },
    developer: "Karagir Studio",
    category: "Shopping",
    rating: 4.9,
    ratingCount: "2.4K Ratings",
    ageRating: "4+",
    price: "Free",
    description: {
      "en-US": "Empowering traditional Indian artisans through AI-assisted cataloging, natural voice valuation in regional languages, and direct buyer connections with milestone escrow protection."
    }
  },
  scenes: [
    {
      kind: "screenshot",
      id: "store-01-home",
      flow: "store-01-home",
      headline: { "en-US": "Discover Authentic Crafts" },
      subhead: { "en-US": "Direct connection to verified local artisans with zero middlemen." }
    },
    {
      kind: "screenshot",
      id: "store-02-explore",
      flow: "store-02-explore",
      headline: { "en-US": "Find Verified Masters" },
      subhead: { "en-US": "Explore regional craft hubs and view verified artisan credentials." }
    },
    {
      kind: "screenshot",
      id: "store-03-voice",
      flow: "store-03-voice",
      headline: { "en-US": "Natural Voice Valuation" },
      subhead: { "en-US": "Speak in Hindi or Marathi for instant, market-grounded pricing." }
    },
    {
      kind: "screenshot",
      id: "store-04-custom",
      flow: "store-04-custom",
      headline: { "en-US": "AI Bespoke Customization" },
      subhead: { "en-US": "Design custom furniture and craft items with intelligent AI assistance." }
    },
    {
      kind: "screenshot",
      id: "store-05-orders",
      flow: "store-05-orders",
      headline: { "en-US": "Secure Milestone Escrow" },
      subhead: { "en-US": "Track workshop progress with escrow payments released at each stage." }
    }
  ]
};

export default config;
