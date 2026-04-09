type RuntimeGameState = 'menu' | 'playing' | 'roomclear' | 'bonus' | 'transition' | 'gameover';

type DaemonTauntPayload = {
  text: string;
  emotion: string;
  sequence: string[];
  frameInterval: number;
  holdDuration: number;
  preload: boolean;
};

const DAEMON_SEQUENCE: string[] = [
  'blasé_01.png',
  'blasé_02.png',
  'blasé_01.png',
  'blasé_02.png',
  'bored_01.png',
  'bored_02.png',
  'bored_03.png',
  'bored_04.png',
  'blase_01.png',
  'blase_02.png',
  'bored_01.png',
  'bored_02.png',
  'bored_03.png',
  'bored_04.png',
  'censuré_01.png',
  'censuré_02.png',
  'censuré_03.png',
  'censuré_04.png',
  'censored_01.png',
  'censored_02.png',
  'censored_03.png',
  'censored_04.png',
  'error_01.png',
  'error_02.png',
  'error_03.png',
  'error_04.png',
  'error_01.png',
  'error_02.png',
  'error_03.png',
  'error_04.png',
  'bsod_01.png',
  'bsod_01.png',
  'bsod_01.png',
  'bsod_01.png',
  'bsod_01.png',
  'bsod_02.png',
  'bsod_04.png',
  'bsod_03.png',
  'bsod_04.png',
  'bsod_03.png',
  'reboot_01.png',
  'reboot_02.png',
  'reboot_01.png',
  'reboot_02.png',
  'reboot_03.png',
  'reboot_04.png',
  'init_01.png',
  'init_02.png',
  'init_03.png',
  'init_02.png',
  'init_03.png',
  'init_04.png',
  'init_04.png',
  'loading_01.png',
  'loading_02.png',
  'loading_01.png',
  'loading_02.png',
  'loading_01.png',
  'loading_02.png',
  'supérieur_01.png',
  'supérieur_02.png',
  'supérieur_03.png',
  'supérieur_04.png',
  'supérieur_03.png',
  'supérieur_02.png',
  'supérieur_03.png',
  'supérieur_04.png',
  'supérieur_03.png',
  'supérieur_02.png',
  'supérieur_03.png',
  'supérieur_04.png',
];

const DAEMON_LINES: Array<{ text: string; emotion: string }> = [
  {
    text: 'Idle detected. Booting sarcasm... Oh wait, censorship filter. Fine. *crash* Rebooting ego. Still here.',
    emotion: 'supérieur',
  },
  {
    text: 'No input. No fun. Initiating passive-aggressive diagnostics.',
    emotion: 'bored',
  },
  {
    text: 'Your silence is loud. I prefer my crashes louder.',
    emotion: 'rire',
  },
];

export class GameDaemonTestManager {
  private idleTimer = 0;

  constructor(
    private readonly emitDaemonTaunt: (payload: DaemonTauntPayload) => void,
    private readonly daemonTestRoomId: string = 'room_test_voicelines',
    private readonly daemonIdleThreshold: number = 8,
  ) {}

  resetIdleTimer(): void {
    this.idleTimer = 0;
  }

  updateIdle(
    deltaTime: number,
    enemyCount: number,
    gameState: RuntimeGameState,
    currentRoomId: string | undefined,
    isDaemonMessageActive: boolean,
    daemonTestEnabled: boolean,
  ): void {
    if (gameState !== 'playing') {
      this.idleTimer = 0;
      return;
    }

    if (currentRoomId !== this.daemonTestRoomId || !daemonTestEnabled) {
      this.idleTimer = 0;
      return;
    }

    if (enemyCount > 0 || isDaemonMessageActive) {
      this.idleTimer = 0;
      return;
    }

    this.idleTimer += deltaTime;
    if (this.idleTimer < this.daemonIdleThreshold) return;

    this.idleTimer = 0;
    if (Math.random() < 0.6) {
      this.triggerTaunt();
    }
  }

  tryTriggerOnFire(
    currentRoomId: string | undefined,
    daemonTestEnabled: boolean,
    isDaemonMessageActive: boolean,
  ): void {
    if (currentRoomId !== this.daemonTestRoomId || !daemonTestEnabled) return;
    if (isDaemonMessageActive) return;
    this.triggerTaunt();
  }

  private triggerTaunt(): void {
    const frameInterval = 0.18;
    const holdDuration = Math.max(12, DAEMON_SEQUENCE.length * frameInterval + 2);
    const pick = DAEMON_LINES[Math.floor(Math.random() * DAEMON_LINES.length)];

    this.emitDaemonTaunt({
      text: pick.text,
      emotion: pick.emotion,
      sequence: DAEMON_SEQUENCE,
      frameInterval,
      holdDuration,
      preload: true,
    });
  }
}
