// Input validation shared by both data sources. Returns { field: message }.
import { ISSUE_CATEGORIES, PLATFORM_BY_ID, SEVERITY_BY_ID, ROLE_BY_ID } from "../lib/constants.js";

export function validateIssue(input) {
  const e = {};
  if (!input.storeId) e.storeId = "Choose the store this issue is for.";
  if (!PLATFORM_BY_ID[input.platformId]) e.platformId = "Choose a delivery platform.";
  if (!ISSUE_CATEGORIES.includes(input.category)) e.category = "Choose a category.";
  if (!SEVERITY_BY_ID[input.severity]) e.severity = "Choose a severity.";
  const title = (input.title ?? "").trim();
  if (title.length < 5) e.title = "Add a short summary (at least 5 characters).";
  else if (title.length > 120) e.title = "Keep the summary under 120 characters.";
  if (input.orderId && !/^#?[A-Za-z0-9-]{4,20}$/.test(input.orderId.trim())) e.orderId = "Order IDs are 4–20 letters or numbers, e.g. #8F3A2C.";
  return e;
}

export function validateUser(input, existing = []) {
  const e = {};
  if ((input.name ?? "").trim().length < 2) e.name = "Enter the person's full name.";
  const email = (input.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "Enter a valid email, e.g. name@company.com.";
  else if (existing.some((u) => u.email.toLowerCase() === email && u.id !== input.id)) e.email = "Someone with this email is already on the team.";
  if (!ROLE_BY_ID[input.role]) e.role = "Choose a role.";
  return e;
}

export function validateThresholds(t) {
  const e = {};
  if (!(t.errorRate > 0 && t.errorRate < 0.5)) e.errorRate = "Use a rate between 0.1% and 50%.";
  if (!(t.minRating >= 1 && t.minRating <= 5)) e.minRating = "Ratings run from 1.0 to 5.0.";
  if (!(Number.isFinite(t.downtimeMin) && t.downtimeMin >= 0 && t.downtimeMin <= 1440)) e.downtimeMin = "Use 0–1,440 minutes per day.";
  return e;
}

export class ValidationError extends Error {
  constructor(fields) {
    super("Some fields need attention.");
    this.fields = fields;
  }
}
