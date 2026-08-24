import { BadRequestException } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";

export const hashAuthToken = (value: string) => createHash("sha256").update(value).digest("hex");
export const createAuthToken = () => randomBytes(32).toString("base64url");

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function normalizePhone(value: string) {
  let phone = value.trim().replace(/[\s().-]/g, "");
  if (phone.startsWith("0")) phone = `+84${phone.slice(1)}`;
  else if (phone.startsWith("84")) phone = `+${phone}`;
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new BadRequestException("Số điện thoại không hợp lệ.");
  return phone;
}
