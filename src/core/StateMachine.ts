/**
 * StateMachine - Manages game states and transitions
 */

export enum GameState {
  BOOT = 'BOOT',
  MAIN_MENU = 'MAIN_MENU',
  CHARACTER_SELECT = 'CHARACTER_SELECT',
  GAMEPLAY_LOOP = 'GAMEPLAY_LOOP',
  PAUSE = 'PAUSE',
  GAME_OVER = 'GAME_OVER',
}

export interface IState {
  enter(): void;
  update(deltaTime: number): void;
  exit(): void;
}

export class StateMachine {
  private currentState: GameState | null = null;
  private states: Map<GameState, IState> = new Map();

  registerState(state: GameState, stateInstance: IState): void {
    this.states.set(state, stateInstance);
  }

  transition(newState: GameState): void {
    if (this.currentState === newState) return;

    // Exit current state
    if (this.currentState !== null) {
      const current = this.states.get(this.currentState);
      if (current) {
        current.exit();
      }
    }

    // Enter new state
    this.currentState = newState;
    const next = this.states.get(newState);
    if (next) {
      next.enter();
    } else {
      console.error(`State ${newState} not registered`);
    }
  }

  update(deltaTime: number): void {
    if (this.currentState !== null) {
      const current = this.states.get(this.currentState);
      if (current) {
        current.update(deltaTime);
      }
    }
  }

  getCurrentState(): GameState | null {
    return this.currentState;
  }
}
