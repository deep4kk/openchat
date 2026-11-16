import { PrismaClient } from "@prisma/client";
import "./env"; // sets DATABASE_URL from the Supabase integration's variables when needed

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
