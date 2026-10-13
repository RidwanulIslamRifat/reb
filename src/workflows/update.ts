import { planSetup, type SetupInput, type SetupPlan } from "./setup.js";

/**
 * reb update (ROADMAP decision 18): agents run reb with `npx @ridwanul/reb@latest`, so there is no
 * installed copy to update. Update refreshes the registration and handbook in every agent that
 * already has reb, using the same preview, approval and backups as setup.
 */
export async function planUpdate(
  input: Omit<SetupInput, "agents" | "onlyRegistered">,
): Promise<SetupPlan> {
  return planSetup({ ...input, onlyRegistered: true });
}
