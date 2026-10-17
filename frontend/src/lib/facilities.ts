export interface Facility {
  name: string;
  type: "DEIC" | "RBSK" | "District Hospital";
  km: number;
  phone: string;
  address: string;
  bestFor: "early" | "school";
}

export interface PinResult {
  pin: string;
  city: string;
  facilities: Facility[];
}

/** Fictional demo listings — verify real services before referring. */
export const FACILITY_DB: Record<string, PinResult> = {
  "110029": {
    pin: "110029",
    city: "South Delhi",
    facilities: [
      { name: "DEIC — Sarita Vihar", type: "DEIC", km: 3.2, phone: "011 4155 2290", address: "Okhla Phase II, South Delhi", bestFor: "early" },
      { name: "RBSK Child Health Team — Aliganj", type: "RBSK", km: 5.8, phone: "011 2953 4471", address: "Aliganj, South Delhi", bestFor: "early" },
      { name: "District Hospital Rehab — Pushp Vihar", type: "District Hospital", km: 7.1, phone: "011 2953 4100", address: "Pushp Vihar, South Delhi", bestFor: "school" },
    ],
  },
  "110001": {
    pin: "110001",
    city: "New Delhi",
    facilities: [
      { name: "RBSK Child Health Team — Daryaganj", type: "RBSK", km: 1.4, phone: "011 2389 6612", address: "Daryaganj, New Delhi", bestFor: "early" },
      { name: "DEIC — LNJP Annex", type: "DEIC", km: 2.6, phone: "011 2381 3105", address: "Bahadur Shah Zafar Marg", bestFor: "early" },
      { name: "Municipal Child Rehab Unit", type: "District Hospital", km: 3.9, phone: "011 2381 7722", address: "Chandni Chowk, New Delhi", bestFor: "school" },
    ],
  },
  "110054": {
    pin: "110054",
    city: "North Delhi",
    facilities: [
      { name: "DEIC — GTB Enclave", type: "DEIC", km: 4.4, phone: "011 2396 8801", address: "Dilshad Garden, North Delhi", bestFor: "early" },
      { name: "RBSK Child Health Team — Burari", type: "RBSK", km: 6.2, phone: "011 2982 1190", address: "Burari, North Delhi", bestFor: "early" },
      { name: "North MCD Rehab Unit", type: "District Hospital", km: 8.7, phone: "011 2711 3345", address: "Pitampura, North Delhi", bestFor: "school" },
    ],
  },
  "400012": {
    pin: "400012",
    city: "Mumbai",
    facilities: [
      { name: "DEIC — Parel Unit", type: "DEIC", km: 2.1, phone: "022 2413 6051", address: "Parel, Mumbai", bestFor: "early" },
      { name: "RBSK Child Health Team — Andheri", type: "RBSK", km: 6.9, phone: "022 2821 7700", address: "Andheri West, Mumbai", bestFor: "early" },
      { name: "District Rehab Unit — Goregaon", type: "District Hospital", km: 9.3, phone: "022 2871 4455", address: "Goregaon East, Mumbai", bestFor: "school" },
    ],
  },
  "560029": {
    pin: "560029",
    city: "Bengaluru",
    facilities: [
      { name: "DEIC — Shivajinagar", type: "DEIC", km: 3.8, phone: "080 2286 1100", address: "Shivajinagar, Bengaluru", bestFor: "early" },
      { name: "RBSK Child Health Team — Jayanagar", type: "RBSK", km: 5.2, phone: "080 2659 4470", address: "Jayanagar, Bengaluru", bestFor: "early" },
      { name: "District Hospital Rehab — KR Puram", type: "District Hospital", km: 11.6, phone: "080 2528 9901", address: "KR Puram, Bengaluru", bestFor: "school" },
    ],
  },
};

export const SAMPLE_PINS = [
  { pin: "110029", label: "South Delhi" },
  { pin: "110001", label: "New Delhi" },
  { pin: "110054", label: "North Delhi" },
  { pin: "400012", label: "Mumbai" },
  { pin: "560029", label: "Bengaluru" },
  { pin: "999999", label: "Unserved PIN" },
];
