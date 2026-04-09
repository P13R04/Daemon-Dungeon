import type { AbstractMesh, TransformNode, Vector3 } from '@babylonjs/core';
import type { TextBlock } from '@babylonjs/gui';

export interface DamageNumber {
  text: TextBlock;
  value: number;
  position: Vector3;
  timeElapsed: number;
  duration: number;
  anchor: TransformNode;
}

export interface AudioEngineLike {
  audioContext?: AudioContext;
  unlocked?: boolean;
  useCustomUnlockedButton?: boolean;
  unlock?: () => void;
  setGlobalVolume?: (value: number) => void;
}

export interface EnemyEventPayload {
  enemyId?: string;
  entityId?: string;
  enemyName?: string;
  mesh?: AbstractMesh;
  maxHP?: number;
  currentHP?: number;
  position?: Vector3;
  damage?: number;
}

export interface PlayerDamagedPayload {
  health?: { current: number; max: number };
  damage?: number;
}

export interface RoomEnteredPayload {
  roomType?: string;
  roomName?: string;
}

export interface DaemonTauntPayload {
  text?: string;
  emotion?: string;
  sequence?: string[];
  frameInterval?: number;
  holdDuration?: number;
  preload?: boolean;
}

export interface UiOptionChangedPayload {
  option?: string;
  value?: boolean;
}

export interface PlayerUltReadyPayload {
  charge: number;
}
