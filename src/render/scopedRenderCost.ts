/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * `planRenderCost`, answered once per plan while a construction scope is open
 * (`constructionScope.ts`); outside one it is the original function
 * (2026-10-18, boot CPU). Every ordinary presentation rung, the terrain's
 * admission re-check and every Ultra rung price the same immutable plan with
 * it, and each only reads the answer: none returns it or any part of it, and
 * none writes to it.
 */
import { planRenderCost } from '../level/renderBudget.ts';
import { scopedQuery } from './constructionScope.ts';

export const scopedPlanRenderCost = scopedQuery(planRenderCost);
