import "dotenv/config";
import { hash } from "@node-rs/argon2";
import { prisma } from "../server/database/client";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required when SEED_ADMIN=true.`);
  return value;
}

async function main() {
  if (process.env.SEED_ADMIN !== "true") {
    console.log("Admin seed skipped. Set SEED_ADMIN=true to enable it.");
    return;
  }

  const email = required("ADMIN_EMAIL").toLowerCase();
  const password = required("ADMIN_PASSWORD");
  const fullName = required("ADMIN_FULL_NAME");
  let phone = required("ADMIN_PHONE").replace(/[\s().-]/g, "");
  if (phone.startsWith("0")) phone = `+84${phone.slice(1)}`;
  else if (phone.startsWith("84")) phone = `+${phone}`;

  if (password.length < 12) {
    throw new Error("ADMIN_PASSWORD must contain at least 12 characters.");
  }
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
    throw new Error("ADMIN_PHONE must be a valid phone number.");
  }

  const passwordHash = await hash(password, {
    algorithm: 2 as const,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  const admin = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      phone,
      fullName,
      passwordHash,
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
      roles: { create: { role: "ADMIN" } },
    },
    update: {
      phone,
      fullName,
      passwordHash,
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
  });

  await prisma.userRole.upsert({
    where: { userId_role: { userId: admin.id, role: "ADMIN" } },
    create: { userId: admin.id, role: "ADMIN" },
    update: {},
  });

  console.log(`Admin account is ready: ${admin.email}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
