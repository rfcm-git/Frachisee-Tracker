// Internal Terms of Service: DRAFT for review by legal/HR before launch.
// The same text lives in docs/TERMS-OF-SERVICE.md; keep them in sync.

export const TERMS_META = {
  version: "Draft 0.1",
  updated: "November 3, 2026",
  owner: "3PD Operations",
};

export const TERMS = [
  {
    id: "about",
    title: "About these terms",
    body: [
      "3PD Ops Tracker (“the Tracker”) is an internal tool for monitoring third-party delivery (3PD) performance and order issues for Subway franchisee stores in our network. These terms apply to everyone who signs in.",
      "By using the Tracker you agree to these terms and to the company policies they refer to. If something here conflicts with your employment or contractor agreement, that agreement wins.",
    ],
  },
  {
    id: "access",
    title: "Who can use it",
    body: [
      "Access is limited to approved staff in these roles: Admin, FBC (franchisee business consultant), area coach and OM (operations manager). An Admin grants access and sets your role.",
      "Your account is for you alone. Don't share your sign-in, and don't let others view data through your account. Tell an Admin straight away if you think your account has been used by someone else.",
      "Access ends when your role no longer needs it, when you leave, or when an Admin deactivates your account.",
    ],
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    body: [
      "Use the Tracker only to support store operations: reviewing 3PD performance, flagging and resolving issues, and coaching franchisees.",
      "Don't: export or copy data for use outside the company; use data to compete with or disadvantage a franchisee; try to reach data or settings your role doesn't allow; put the Tracker under automated load (scraping, bulk scripts) without Admin approval; or enter false or misleading information in issues.",
      "Keep notes factual and professional. Issue notes may be shared with franchisees and 3PD partners when resolving a case.",
    ],
  },
  {
    id: "confidentiality",
    title: "Confidential and personal data",
    body: [
      "Sales, order, rating and payout data for franchisee stores is confidential business information. Treat it under the company's data-handling policy.",
      "Keep customer personal data out of the Tracker. Order IDs are fine; customer names, phone numbers, addresses and payment details are not. If a screenshot shows them, crop or blur them before you upload.",
      "Franchisee contact details are for operational follow-up only.",
    ],
  },
  {
    id: "partners",
    title: "Delivery partner data",
    body: [
      "Data from DoorDash, Uber Eats and Grubhub reaches the Tracker under each partner's merchant agreement. Using it must also follow those agreements, including any limits on sharing or storing it.",
      "Partner names and logos belong to their owners and appear here only to identify each platform.",
    ],
  },
  {
    id: "accuracy",
    title: "Accuracy and limits",
    body: [
      "Metrics come from scheduled syncs and can lag, typically 15 to 60 minutes. “Today so far” figures are partial, and earlier days can change when a partner corrects its data.",
      "The Tracker is not the system of record for payouts, refunds, error charges or franchisee billing. Confirm those in the partner's merchant portal or the finance system before acting on them.",
      "Health levels and thresholds are operational guides, not performance ratings of any franchisee or employee.",
    ],
  },
  {
    id: "monitoring",
    title: "Activity logs",
    body: [
      "Sign-ins, issue changes, setting changes and user-management actions are logged with your name and the time. Logs support audits, security reviews and resolving disputes about who changed what.",
    ],
  },
  {
    id: "changes",
    title: "Availability and changes",
    body: [
      "We aim to keep the Tracker available during store hours but don't guarantee it. Planned maintenance will be announced in advance where possible.",
      "We may change features or these terms. Material changes will be announced in the app, and continuing to use it means you accept them.",
    ],
  },
  {
    id: "breaches",
    title: "If these terms are broken",
    body: [
      "Misuse can lead to loss of access and may be handled under company disciplinary procedures. Suspected data exposure must be reported to the security team within 24 hours.",
    ],
  },
  {
    id: "contact",
    title: "Questions",
    body: ["Contact the 3PD Operations team or your Admin. For data-protection questions, contact the privacy or legal team."],
  },
];
