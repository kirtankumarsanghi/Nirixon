/**
 * Verified Indian Public Health & Crisis Helplines
 *
 * Source: Government of India National Health Mission & Ministry of Health and Family Welfare.
 * Used across landing page, emergency banners, and screening help navigator.
 */

export interface HelplineItem {
  name: string;
  number: string;
  tel: string;
  description: string;
  hours: string;
  verifiedBy: string;
}

export const VERIFIED_HELPLINES: Record<string, HelplineItem> = {
  kiran: {
    name: "Kiran Mental Health Helpline",
    number: "1800-599-0019",
    tel: "tel:18005990019",
    description: "24/7 mental health counseling, stress and psychosocial support across 13 Indian languages.",
    hours: "24/7 Toll-Free",
    verifiedBy: "Ministry of Social Justice and Empowerment, Govt. of India",
  },
  childline: {
    name: "CHILDLINE India",
    number: "1098",
    tel: "tel:1098",
    description: "Emergency care, protection, and crisis intervention for children in distress.",
    hours: "24/7 Toll-Free",
    verifiedBy: "Ministry of Women and Child Development, Govt. of India",
  },
  telemanas: {
    name: "Tele-MANAS",
    number: "14416 / 1800-891-4416",
    tel: "tel:14416",
    description: "Comprehensive national digital mental health network with multi-lingual clinical counselors.",
    hours: "24/7 Toll-Free",
    verifiedBy: "Ministry of Health and Family Welfare, Govt. of India",
  },
  nimhans: {
    name: "NIMHANS Psychosocial Helpline",
    number: "080-46110007",
    tel: "tel:08046110007",
    description: "Specialized clinical psychology, developmental, and child guidance support.",
    hours: "9:00 AM – 4:30 PM (Mon–Sat)",
    verifiedBy: "National Institute of Mental Health and Neurosciences (NIMHANS), Bengaluru",
  },
};
