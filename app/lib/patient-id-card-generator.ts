/**
 * Realistic Synthetic Patient ID & Driver's License Generator
 * 
 * Provides authentic, HIPAA-compliant synthetic state Driver's Licenses and 
 * identity verification portraits for EHR patient charts.
 */

export type PatientPhotoType = "license" | "headshot" | "custom";

export type PatientIdCard = {
  documentType: "Driver's License" | "State ID" | "Passport" | "Military ID";
  licenseNumber: string;
  state: string;
  expirationDate: string;
  issueDate: string;
  classType: string;
  realIdCompliant: boolean;
  donor: boolean;
  address: string;
  height: string;
  eyes: string;
  hair: string;
  sex: string;
  verified: boolean;
  verifiedAt: string;
  verifiedBy: string;
};

export type PatientPhotoProfile = {
  id: string;
  photoUrl: string;
  photoType: PatientPhotoType;
  idCard: PatientIdCard;
};

// High-fidelity SVG portraits for synthetic patients
export const SYNTHETIC_PATIENT_PORTRAITS: Record<string, string> = {
  "maya-chen": `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240" width="200" height="240">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="%23dbeafe"/>
        <stop offset="100%" stop-color="%2393c5fd"/>
      </linearGradient>
    </defs>
    <rect width="200" height="240" fill="url(%23bg)"/>
    <!-- Shoulders & Coat -->
    <path d="M20,240 C35,180 65,165 100,165 C135,165 165,180 180,240 Z" fill="%231e293b"/>
    <path d="M70,165 L100,200 L130,165 Z" fill="%23f8fafc"/>
    <path d="M85,190 L100,240 L115,190 Z" fill="%230284c7"/>
    <!-- Neck -->
    <rect x="86" y="125" width="28" height="42" fill="%23fed7aa" rx="4"/>
    <!-- Head/Face -->
    <ellipse cx="100" cy="105" rx="38" ry="46" fill="%23ffedd5"/>
    <!-- Hair Background -->
    <path d="M60,110 C55,60 145,60 140,110 C140,150 135,160 135,160 L65,160 Z" fill="%230f172a"/>
    <ellipse cx="100" cy="103" rx="36" ry="44" fill="%23ffedd5"/>
    <!-- Hair Bangs -->
    <path d="M62,95 C75,65 125,65 138,95 C125,80 75,80 62,95 Z" fill="%230f172a"/>
    <!-- Eyes & Brows -->
    <path d="M76,92 Q86,88 94,92" stroke="%23334155" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <path d="M106,92 Q114,88 124,92" stroke="%23334155" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <ellipse cx="85" cy="101" rx="4" ry="4" fill="%231e293b"/>
    <ellipse cx="115" cy="101" rx="4" ry="4" fill="%231e293b"/>
    <!-- Glasses -->
    <rect x="74" y="94" width="22" height="15" rx="3" fill="none" stroke="%23475569" stroke-width="2"/>
    <rect x="104" y="94" width="22" height="15" rx="3" fill="none" stroke="%23475569" stroke-width="2"/>
    <line x1="96" y1="100" x2="104" y2="100" stroke="%23475569" stroke-width="2"/>
    <!-- Nose & Mouth -->
    <path d="M100,103 L98,114 L103,114" stroke="%23fdba74" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M88,126 Q100,133 112,126" stroke="%23e11d48" stroke-width="2.2" fill="none" stroke-linecap="round"/>
  </svg>`,

  "jordan-reed": `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240" width="200" height="240">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="%23fed7aa"/>
        <stop offset="100%" stop-color="%23fdba74"/>
      </linearGradient>
    </defs>
    <rect width="200" height="240" fill="url(%23bg)"/>
    <!-- Shoulders -->
    <path d="M15,240 C30,175 60,160 100,160 C140,160 170,175 185,240 Z" fill="%230f766e"/>
    <path d="M75,160 L100,195 L125,160 Z" fill="%23ccfbf1"/>
    <!-- Neck -->
    <rect x="85" y="120" width="30" height="46" fill="%2378350f" rx="5"/>
    <!-- Head/Face -->
    <ellipse cx="100" cy="100" rx="40" ry="46" fill="%23854d0e"/>
    <!-- Hair -->
    <path d="M60,90 C60,55 140,55 140,90 C140,70 60,70 60,90 Z" fill="%23171717"/>
    <!-- Trim Beard -->
    <path d="M68,105 C70,148 130,148 132,105 C132,120 125,142 100,144 C75,142 68,120 68,105 Z" fill="%23171717"/>
    <!-- Brows & Eyes -->
    <path d="M74,86 Q86,83 94,86" stroke="%23171717" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M106,86 Q114,83 126,86" stroke="%23171717" stroke-width="3" fill="none" stroke-linecap="round"/>
    <ellipse cx="84" cy="95" rx="4" ry="4" fill="%230f172a"/>
    <ellipse cx="116" cy="95" rx="4" ry="4" fill="%230f172a"/>
    <!-- Nose & Mouth -->
    <path d="M100,96 L97,112 L104,112" stroke="%23713f12" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <path d="M88,124 Q100,129 112,124" stroke="%23451a03" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  </svg>`,

  "elena-rostova": `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240" width="200" height="240">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="%23fce7f3"/>
        <stop offset="100%" stop-color="%23fbcfe8"/>
      </linearGradient>
    </defs>
    <rect width="200" height="240" fill="url(%23bg)"/>
    <!-- Long Hair Back -->
    <path d="M50,90 C40,160 55,240 70,240 L130,240 C145,240 160,160 150,90 Z" fill="%23d97706"/>
    <!-- Shoulders -->
    <path d="M20,240 C35,185 65,170 100,170 C135,170 165,185 180,240 Z" fill="%234338ca"/>
    <path d="M72,170 Q100,205 128,170 Z" fill="%23e0e7ff"/>
    <!-- Neck -->
    <rect x="87" y="125" width="26" height="48" fill="%23ffedd5" rx="4"/>
    <!-- Head -->
    <ellipse cx="100" cy="102" rx="37" ry="45" fill="%23fef3c7"/>
    <!-- Hair Front -->
    <path d="M63,85 C75,55 125,55 137,85 C145,115 140,165 135,175 C125,120 130,90 100,75 C70,90 75,120 65,175 C60,165 55,115 63,85 Z" fill="%23b45309"/>
    <!-- Eyes -->
    <path d="M77,91 Q86,88 94,91" stroke="%2392400e" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <path d="M106,91 Q114,88 123,91" stroke="%2392400e" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <ellipse cx="85" cy="99" rx="3.8" ry="3.8" fill="%230284c7"/>
    <ellipse cx="115" cy="99" rx="3.8" ry="3.8" fill="%230284c7"/>
    <!-- Smile -->
    <path d="M100,102 L98,112 L103,112" stroke="%23fcd34d" stroke-width="2" fill="none"/>
    <path d="M89,124 Q100,132 111,124" stroke="%23be123c" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  </svg>`,

  "david-kim": `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240" width="200" height="240">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="%23f1f5f9"/>
        <stop offset="100%" stop-color="%23cbd5e1"/>
      </linearGradient>
    </defs>
    <rect width="200" height="240" fill="url(%23bg)"/>
    <!-- Shoulders -->
    <path d="M15,240 C30,175 60,160 100,160 C140,160 170,175 185,240 Z" fill="%23334155"/>
    <path d="M78,160 L100,195 L122,160 Z" fill="%23f8fafc"/>
    <path d="M92,185 L100,240 L108,185 Z" fill="%23991b1b"/>
    <!-- Neck -->
    <rect x="85" y="120" width="30" height="44" fill="%23fed7aa" rx="4"/>
    <!-- Face -->
    <ellipse cx="100" cy="100" rx="39" ry="46" fill="%23ffedd5"/>
    <!-- Hair with graying temples -->
    <path d="M60,92 C60,55 140,55 140,92 C140,70 60,70 60,92 Z" fill="%231e293b"/>
    <path d="M61,85 C61,72 68,68 72,68" stroke="%2394a3b8" stroke-width="3" fill="none"/>
    <path d="M139,85 C139,72 132,68 128,68" stroke="%2394a3b8" stroke-width="3" fill="none"/>
    <!-- Eyes -->
    <path d="M74,88 Q85,85 93,88" stroke="%23334155" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <path d="M107,88 Q115,85 126,88" stroke="%23334155" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <ellipse cx="84" cy="96" rx="3.5" ry="3.5" fill="%230f172a"/>
    <ellipse cx="116" cy="96" rx="3.5" ry="3.5" fill="%230f172a"/>
    <!-- Nose & Confident Expression -->
    <path d="M100,97 L98,111 L103,111" stroke="%23fdba74" stroke-width="2" fill="none"/>
    <path d="M89,123 Q100,128 111,123" stroke="%23475569" stroke-width="2.2" fill="none" stroke-linecap="round"/>
  </svg>`,

  "marcus-vance": `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240" width="200" height="240">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="%23fef3c7"/>
        <stop offset="100%" stop-color="%23fde68a"/>
      </linearGradient>
    </defs>
    <rect width="200" height="240" fill="url(%23bg)"/>
    <!-- Jacket -->
    <path d="M15,240 C30,175 60,160 100,160 C140,160 170,175 185,240 Z" fill="%23854d0e"/>
    <path d="M75,160 L100,195 L125,160 Z" fill="%231e293b"/>
    <!-- Neck -->
    <rect x="86" y="120" width="28" height="44" fill="%23fed7aa" rx="4"/>
    <!-- Face -->
    <ellipse cx="100" cy="100" rx="38" ry="46" fill="%23ffedd5"/>
    <!-- Curly Hair -->
    <path d="M60,95 C55,50 145,50 140,95 C145,80 135,55 100,55 C65,55 55,80 60,95 Z" fill="%23451a03"/>
    <circle cx="70" cy="65" r="9" fill="%23451a03"/>
    <circle cx="88" cy="58" r="9" fill="%23451a03"/>
    <circle cx="108" cy="58" r="9" fill="%23451a03"/>
    <circle cx="128" cy="65" r="9" fill="%23451a03"/>
    <!-- Stubble -->
    <path d="M75,120 Q100,146 125,120" stroke="%23b45309" stroke-width="1.5" stroke-dasharray="2,2" fill="none"/>
    <!-- Eyes -->
    <ellipse cx="85" cy="98" rx="4" ry="4" fill="%2315803d"/>
    <ellipse cx="115" cy="98" rx="4" ry="4" fill="%2315803d"/>
    <path d="M75,89 Q85,86 94,89" stroke="%23451a03" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <path d="M106,89 Q115,86 125,89" stroke="%23451a03" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <path d="M100,99 L98,112 L103,112" stroke="%23fdba74" stroke-width="2" fill="none"/>
    <path d="M90,125 Q100,131 110,125" stroke="%2378350f" stroke-width="2.2" fill="none" stroke-linecap="round"/>
  </svg>`,

  "sofia-martinez": `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240" width="200" height="240">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="%23e0e7ff"/>
        <stop offset="100%" stop-color="%23c7d2fe"/>
      </linearGradient>
    </defs>
    <rect width="200" height="240" fill="url(%23bg)"/>
    <!-- Long Hair Back -->
    <path d="M50,90 C40,150 48,240 65,240 L135,240 C152,240 160,150 150,90 Z" fill="%2318181b"/>
    <!-- Top -->
    <path d="M25,240 C40,185 68,170 100,170 C132,170 160,185 175,240 Z" fill="%23be185d"/>
    <!-- Neck -->
    <rect x="88" y="125" width="24" height="48" fill="%23fed7aa" rx="4"/>
    <!-- Face -->
    <ellipse cx="100" cy="102" rx="35" ry="44" fill="%23ffedd5"/>
    <!-- Hair Front/Sides -->
    <path d="M62,85 C75,55 125,55 138,85 C145,115 142,165 136,180 C128,125 132,95 100,78 C68,95 72,125 64,180 C58,165 55,115 62,85 Z" fill="%2318181b"/>
    <!-- Eyes -->
    <path d="M77,91 Q86,88 94,91" stroke="%2318181b" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <path d="M106,91 Q114,88 123,91" stroke="%2318181b" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <ellipse cx="85" cy="99" rx="3.8" ry="3.8" fill="%23713f12"/>
    <ellipse cx="115" cy="99" rx="3.8" ry="3.8" fill="%23713f12"/>
    <path d="M100,102 L98,113 L103,113" stroke="%23fdba74" stroke-width="2" fill="none"/>
    <path d="M88,125 Q100,133 112,125" stroke="%23db2777" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  </svg>`,
};

export const SYNTHETIC_PATIENT_PROFILES: Record<string, PatientPhotoProfile> = {
  "maya-chen": {
    id: "maya-chen",
    photoUrl: SYNTHETIC_PATIENT_PORTRAITS["maya-chen"],
    photoType: "license",
    idCard: {
      documentType: "Driver's License",
      licenseNumber: "CA D8492014",
      state: "California",
      expirationDate: "04/18/2028",
      issueDate: "05/12/2023",
      classType: "C",
      realIdCompliant: true,
      donor: true,
      address: "482 Ocean Ave, Apt 4B, San Francisco, CA 94112",
      height: `5'-04"`,
      eyes: "BRN",
      hair: "BLK",
      sex: "F",
      verified: true,
      verifiedAt: "Aug 12, 2026",
      verifiedBy: "Clinic Staff (Logan Carton, MD)",
    },
  },
  "jordan-reed": {
    id: "jordan-reed",
    photoUrl: SYNTHETIC_PATIENT_PORTRAITS["jordan-reed"],
    photoType: "license",
    idCard: {
      documentType: "Driver's License",
      licenseNumber: "CA C7731209",
      state: "California",
      expirationDate: "11/03/2027",
      issueDate: "10/19/2022",
      classType: "C",
      realIdCompliant: true,
      donor: true,
      address: "1290 Market St, Suite 800, San Francisco, CA 94102",
      height: `6'-01"`,
      eyes: "BRN",
      hair: "BLK",
      sex: "M",
      verified: true,
      verifiedAt: "Aug 21, 2026",
      verifiedBy: "Clinic Staff (Logan Carton, MD)",
    },
  },
  "elena-rostova": {
    id: "elena-rostova",
    photoUrl: SYNTHETIC_PATIENT_PORTRAITS["elena-rostova"],
    photoType: "license",
    idCard: {
      documentType: "Driver's License",
      licenseNumber: "CA B3920188",
      state: "California",
      expirationDate: "03/22/2029",
      issueDate: "04/01/2024",
      classType: "C",
      realIdCompliant: true,
      donor: false,
      address: "742 Valencia St, San Francisco, CA 94110",
      height: `5'-07"`,
      eyes: "BLU",
      hair: "BLN",
      sex: "F",
      verified: true,
      verifiedAt: "Aug 05, 2026",
      verifiedBy: "Clinic Staff (Logan Carton, MD)",
    },
  },
  "david-kim": {
    id: "david-kim",
    photoUrl: SYNTHETIC_PATIENT_PORTRAITS["david-kim"],
    photoType: "license",
    idCard: {
      documentType: "Driver's License",
      licenseNumber: "CA F1088924",
      state: "California",
      expirationDate: "12/05/2027",
      issueDate: "01/15/2023",
      classType: "C",
      realIdCompliant: true,
      donor: true,
      address: "310 Townsend St, Unit 312, San Francisco, CA 94107",
      height: `5'-10"`,
      eyes: "BRN",
      hair: "BLK",
      sex: "M",
      verified: true,
      verifiedAt: "Aug 10, 2026",
      verifiedBy: "Clinic Staff (Logan Carton, MD)",
    },
  },
  "marcus-vance": {
    id: "marcus-vance",
    photoUrl: SYNTHETIC_PATIENT_PORTRAITS["marcus-vance"],
    photoType: "license",
    idCard: {
      documentType: "Driver's License",
      licenseNumber: "CA K5510492",
      state: "California",
      expirationDate: "08/14/2028",
      issueDate: "09/02/2023",
      classType: "C",
      realIdCompliant: true,
      donor: true,
      address: "1550 California St, Apt 12, San Francisco, CA 94109",
      height: `5'-11"`,
      eyes: "GRN",
      hair: "BRN",
      sex: "M",
      verified: true,
      verifiedAt: "Aug 04, 2026",
      verifiedBy: "Clinic Staff (Logan Carton, MD)",
    },
  },
  "sofia-martinez": {
    id: "sofia-martinez",
    photoUrl: SYNTHETIC_PATIENT_PORTRAITS["sofia-martinez"],
    photoType: "license",
    idCard: {
      documentType: "State ID",
      licenseNumber: "CA ID-9110408",
      state: "California",
      expirationDate: "01/27/2030",
      issueDate: "02/10/2026",
      classType: "ID",
      realIdCompliant: true,
      donor: true,
      address: "880 Folsom St, San Francisco, CA 94107",
      height: `5'-03"`,
      eyes: "BRN",
      hair: "BLK",
      sex: "F",
      verified: true,
      verifiedAt: "Jul 29, 2026",
      verifiedBy: "Clinic Staff (Logan Carton, MD)",
    },
  },
};

/**
 * Returns default synthetic photo and ID information for a patient.
 */
export function getSyntheticPatientProfile(patientId: string): PatientPhotoProfile | undefined {
  return SYNTHETIC_PATIENT_PROFILES[patientId];
}

/**
 * Generates an SVG Driver's License card markup for high-res visual inspection.
 */
export function generateIdCardSvgDataUrl(
  patientName: string,
  dob: string,
  profileOrCard: PatientPhotoProfile | PatientIdCard,
  customPortraitSvg?: string
): string {
  const idCard: PatientIdCard = "idCard" in profileOrCard ? profileOrCard.idCard : profileOrCard;
  const portraitSvg = customPortraitSvg || ("photoUrl" in profileOrCard ? profileOrCard.photoUrl : SYNTHETIC_PATIENT_PORTRAITS["maya-chen"]);

  const cardSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 540 340" width="540" height="340" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <defs>
        <!-- Background Security Pattern Gradient -->
        <linearGradient id="cardBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#fdfbf7"/>
          <stop offset="50%" stop-color="#f5f0e6"/>
          <stop offset="100%" stop-color="#ebdfcb"/>
        </linearGradient>
        <pattern id="guilloche" width="30" height="30" patternUnits="userSpaceOnUse">
          <path d="M0,15 Q15,0 30,15 T60,15" fill="none" stroke="#d5c8b2" stroke-width="0.5" opacity="0.45"/>
          <path d="M0,15 Q15,30 30,15 T60,15" fill="none" stroke="#d5c8b2" stroke-width="0.5" opacity="0.45"/>
        </pattern>
        <filter id="cardShadow" x="-5%" y="-5%" width="110%" height="110%">
          <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.18"/>
        </filter>
      </defs>

      <!-- Card Base -->
      <rect x="10" y="10" width="520" height="320" rx="16" fill="url(#cardBg)" stroke="#c2b49a" stroke-width="1.5" filter="url(#cardShadow)"/>
      <rect x="10" y="10" width="520" height="320" rx="16" fill="url(#guilloche)"/>

      <!-- Header Banner -->
      <rect x="10" y="10" width="520" height="52" rx="16" fill="#1e3a8a"/>
      <rect x="10" y="50" width="520" height="12" fill="#d97706"/>

      <!-- State Title & Document Type -->
      <text x="32" y="38" font-size="20" font-weight="900" fill="#ffffff" letter-spacing="3">${idCard.state.toUpperCase()}</text>
      <text x="32" y="58" font-size="9" font-weight="800" fill="#ffffff" letter-spacing="1.5">${idCard.documentType.toUpperCase()} · USA</text>

      <!-- Golden Bear & Real ID Seal -->
      <g transform="translate(465, 16)">
        <circle cx="20" cy="18" r="16" fill="#fbbf24" stroke="#d97706" stroke-width="1.5"/>
        <text x="20" y="23" font-size="14" font-weight="900" text-anchor="middle" fill="#78350f">★</text>
        <text x="20" y="31" font-size="5" font-weight="800" text-anchor="middle" fill="#78350f">REAL ID</text>
      </g>

      <!-- DL Number -->
      <text x="180" y="85" font-size="11" font-weight="700" fill="#dc2626">DL</text>
      <text x="202" y="86" font-size="17" font-weight="900" fill="#0f172a" letter-spacing="1.5">${idCard.licenseNumber}</text>

      <!-- Expiration & Issue -->
      <text x="380" y="85" font-size="10" font-weight="700" fill="#dc2626">EXP</text>
      <text x="408" y="85" font-size="12" font-weight="800" fill="#0f172a">${idCard.expirationDate}</text>

      <!-- Portrait Box -->
      <g transform="translate(30, 80)">
        <rect x="0" y="0" width="125" height="150" rx="8" fill="#ffffff" stroke="#94a3b8" stroke-width="1.5"/>
        <image href="${portraitSvg}" x="2" y="2" width="121" height="146" preserveAspectRatio="xMidYMid slice" style="border-radius: 6px;"/>
      </g>

      <!-- Ghost Watermark -->
      <g transform="translate(435, 175)" opacity="0.35">
        <image href="${portraitSvg}" x="0" y="0" width="60" height="72" preserveAspectRatio="xMidYMid slice"/>
      </g>

      <!-- Patient Data Rows -->
      <!-- LN/FN -->
      <text x="180" y="112" font-size="9" font-weight="700" fill="#64748b">1 LN/FN</text>
      <text x="180" y="128" font-size="15" font-weight="800" fill="#0f172a">${patientName.toUpperCase()}</text>

      <!-- Address -->
      <text x="180" y="148" font-size="9" font-weight="700" fill="#64748b">8 ADDR</text>
      <text x="180" y="162" font-size="11" font-weight="600" fill="#1e293b">${idCard.address}</text>

      <!-- DOB, Class, Sex -->
      <text x="180" y="186" font-size="9" font-weight="700" fill="#dc2626">4b DOB</text>
      <text x="225" y="186" font-size="12" font-weight="800" fill="#0f172a">${dob}</text>

      <text x="315" y="186" font-size="9" font-weight="700" fill="#64748b">CLASS</text>
      <text x="355" y="186" font-size="12" font-weight="800" fill="#0f172a">${idCard.classType}</text>

      <!-- Physical Attributes: HGT, WGT, HAIR, EYES -->
      <text x="180" y="212" font-size="9" font-weight="700" fill="#64748b">SEX</text>
      <text x="205" y="212" font-size="11" font-weight="700" fill="#0f172a">${idCard.sex}</text>

      <text x="235" y="212" font-size="9" font-weight="700" fill="#64748b">HAIR</text>
      <text x="265" y="212" font-size="11" font-weight="700" fill="#0f172a">${idCard.hair}</text>

      <text x="300" y="212" font-size="9" font-weight="700" fill="#64748b">EYES</text>
      <text x="335" y="212" font-size="11" font-weight="700" fill="#0f172a">${idCard.eyes}</text>

      <text x="375" y="212" font-size="9" font-weight="700" fill="#64748b">HGT</text>
      <text x="405" y="212" font-size="11" font-weight="700" fill="#0f172a">${idCard.height}</text>

      <!-- Issue Date -->
      <text x="180" y="238" font-size="9" font-weight="700" fill="#64748b">4a ISS</text>
      <text x="225" y="238" font-size="11" font-weight="700" fill="#0f172a">${idCard.issueDate}</text>

      <!-- Donor Badge -->
      ${
        idCard.donor
          ? `<g transform="translate(30, 240)">
               <circle cx="12" cy="12" r="10" fill="#ec4899"/>
               <text x="12" y="16" font-size="11" font-weight="900" text-anchor="middle" fill="#ffffff">♥</text>
               <text x="28" y="16" font-size="10" font-weight="800" fill="#be185d">DONOR</text>
             </g>`
          : ""
      }

      <!-- Signature Script Graphic -->
      <g transform="translate(180, 252)">
        <text x="0" y="15" font-family="'Brush Script MT', cursive, sans-serif" font-size="20" font-style="italic" fill="#0f172a" opacity="0.85">${patientName}</text>
        <line x1="0" y1="20" x2="160" y2="20" stroke="#94a3b8" stroke-width="0.8" stroke-dasharray="3,3"/>
      </g>

      <!-- Clinical Verification Stamp -->
      <g transform="translate(30, 280)">
        <rect x="0" y="0" width="480" height="34" rx="6" fill="#ecfdf5" stroke="#10b981" stroke-width="1"/>
        <circle cx="18" cy="17" r="9" fill="#10b981"/>
        <text x="18" y="21" font-size="10" font-weight="900" text-anchor="middle" fill="#ffffff">✓</text>
        <text x="36" y="16" font-size="10" font-weight="800" fill="#065f46">GOVERNMENT ID VERIFIED</text>
        <text x="36" y="27" font-size="8.5" font-weight="600" fill="#047857">${idCard.verifiedBy} · ${idCard.verifiedAt}</text>
      </g>
    </svg>
  `;

  return `data:image/svg+xml;utf8,${encodeURIComponent(cardSvg)}`;
}
