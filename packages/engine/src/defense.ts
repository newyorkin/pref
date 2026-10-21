import type { AuctionResult, Seat } from "./auction.js";

type ContractResult = Extract<AuctionResult, { type: "contract" }>;

export type DefenseDecision = "pass" | "whist" | "halfWhist";
export type WhistStyle = "light" | "dark";
export type DefensePhase = "whist" | "style" | "play";

export interface DefenseState {
  readonly contract: ContractResult;
  readonly defenders: readonly [Seat, Seat];
  readonly decisions: readonly [
    DefenseDecision | null,
    DefenseDecision | null,
    DefenseDecision | null,
  ];
  readonly whistlers: readonly Seat[];
  readonly defenderObligations: readonly Seat[];
  readonly whistStyle: WhistStyle | null;
  readonly phase: DefensePhase;
  readonly turn: Seat | null;
  readonly halfWhist: Seat | null;
}

export type DefenseAction =
  | { readonly type: DefenseDecision }
  | { readonly type: WhistStyle };

export type DefenseRejection =
  | "finished"
  | "notYourTurn"
  | "invalidDeclaration";

export type DefenseTransition =
  | { readonly accepted: true; readonly state: DefenseState }
  | {
      readonly accepted: false;
      readonly reason: DefenseRejection;
      readonly state: DefenseState;
    };

export function createDefenseState(contract: ContractResult): DefenseState {
  const firstDefender = ((contract.declarer + 1) % 3) as Seat;
  const secondDefender = ((contract.declarer + 2) % 3) as Seat;

  return {
    contract,
    defenders: [firstDefender, secondDefender],
    decisions: [null, null, null],
    whistlers: [],
    defenderObligations: [],
    whistStyle: null,
    phase: "whist",
    turn: firstDefender,
    halfWhist: null,
  };
}

export function applyDefenseAction(
  state: DefenseState,
  seat: Seat,
  action: DefenseAction,
): DefenseTransition {
  if (state.phase === "play") {
    return reject(state, "finished");
  }
  if (state.turn !== seat) {
    return reject(state, "notYourTurn");
  }
  if (state.phase === "whist") {
    return applyWhistDeclaration(state, seat, action);
  }
  return applyWhistStyle(state, action);
}

function applyWhistDeclaration(
  state: DefenseState,
  seat: Seat,
  action: DefenseAction,
): DefenseTransition {
  if (state.halfWhist !== null) {
    return replyToHalfWhist(state, action);
  }
  if (action.type === "halfWhist") {
    return declareHalfWhist(state, seat);
  }
  if (action.type !== "pass" && action.type !== "whist") {
    return reject(state, "invalidDeclaration");
  }

  const [firstDefender, secondDefender] = state.defenders;
  const decisions = [...state.decisions] as DefenseState["decisions"];
  decisions[seat] = action.type;

  if (seat === firstDefender) {
    return accept({
      ...state,
      decisions,
      turn: secondDefender,
    });
  }

  return accept(finishWhistDeclarations(state, decisions));
}

function declareHalfWhist(
  state: DefenseState,
  seat: Seat,
): DefenseTransition {
  const [firstDefender, secondDefender] = state.defenders;
  if (
    seat !== secondDefender ||
    state.decisions[firstDefender] !== "pass" ||
    (state.contract.level !== 6 && state.contract.level !== 7)
  ) {
    return reject(state, "invalidDeclaration");
  }
  const decisions = [...state.decisions] as DefenseState["decisions"];
  decisions[seat] = "halfWhist";
  return accept({
    ...state,
    decisions,
    halfWhist: secondDefender,
    turn: firstDefender,
  });
}

function replyToHalfWhist(
  state: DefenseState,
  action: DefenseAction,
): DefenseTransition {
  const [firstDefender, secondDefender] = state.defenders;
  if (action.type === "pass") {
    return accept(finishWhistDeclarations(state, state.decisions));
  }
  if (action.type !== "whist") {
    return reject(state, "invalidDeclaration");
  }
  const decisions = [...state.decisions] as DefenseState["decisions"];
  decisions[firstDefender] = "whist";
  decisions[secondDefender] = "pass";
  return accept(
    finishWhistDeclarations({ ...state, halfWhist: null }, decisions),
  );
}

function applyWhistStyle(
  state: DefenseState,
  action: DefenseAction,
): DefenseTransition {
  if (action.type !== "light" && action.type !== "dark") {
    return reject(state, "invalidDeclaration");
  }
  return accept({
    ...state,
    whistStyle: action.type,
    phase: "play",
    turn: null,
  });
}

function finishWhistDeclarations(
  state: DefenseState,
  decisions: DefenseState["decisions"],
): DefenseState {
  const whistlers = state.defenders.filter(
    (seat) => decisions[seat] === "whist",
  );
  const singleWhistler = whistlers.length === 1 ? whistlers[0] : undefined;

  return {
    ...state,
    decisions,
    whistlers,
    defenderObligations: whistlers,
    whistStyle: whistlers.length === 2 ? "dark" : null,
    phase: singleWhistler === undefined ? "play" : "style",
    turn: singleWhistler ?? null,
  };
}

function accept(state: DefenseState): DefenseTransition {
  return { accepted: true, state };
}

function reject(
  state: DefenseState,
  reason: DefenseRejection,
): DefenseTransition {
  return { accepted: false, reason, state };
}
