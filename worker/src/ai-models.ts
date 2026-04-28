import type { Env } from "./types";

export const GEMINI_2_5_FLASH = "gemini-2.5-flash";
export const GEMINI_2_5_FLASH_LITE = "gemini-2.5-flash-lite";
export const GEMINI_2_5_PRO = "gemini-2.5-pro";

type WorkerEnv = Env & {
  GEMINI_UTILITY_MODEL?: string;
  LEARN_TURN_MODEL?: string;
};

const UTILITY_MODELS = new Set([GEMINI_2_5_FLASH_LITE, GEMINI_2_5_FLASH]);
const LEARN_TURN_MODELS = new Set([GEMINI_2_5_FLASH, GEMINI_2_5_FLASH_LITE]);

export function resolveUtilityModel(env: Env): string {
  const configured = String((env as WorkerEnv).GEMINI_UTILITY_MODEL || "").trim();
  return UTILITY_MODELS.has(configured) ? configured : GEMINI_2_5_FLASH_LITE;
}

export function resolveLearnTurnModel(env: Env): string {
  const configured = String((env as WorkerEnv).LEARN_TURN_MODEL || "").trim();
  return LEARN_TURN_MODELS.has(configured) ? configured : GEMINI_2_5_FLASH;
}
