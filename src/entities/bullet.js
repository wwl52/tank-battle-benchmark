export const BULLET_R = 3; // half-size; bullets are 6x6

export class Bullet {
  constructor({ x, y, dir, speed, faction, ownerId, power = 1 }) {
    this.x = x; // centre
    this.y = y;
    this.dir = dir;            // 'up' | 'down' | 'left' | 'right'
    this.speed = speed;        // px per second
    this.faction = faction;    // 'player' | 'enemy'
    this.ownerId = ownerId;
    this.power = power;
    this.alive = true;
    this.framesAlive = 0;
  }

  get half() { return BULLET_R; }

  dirVec() {
    switch (this.dir) {
      case 'up': return { x: 0, y: -1 };
      case 'down': return { x: 0, y: 1 };
      case 'left': return { x: -1, y: 0 };
      case 'right': return { x: 1, y: 0 };
      default: throw new Error(`bad bullet dir: ${this.dir}`);
    }
  }

  rect() {
    return { x: this.x - BULLET_R, y: this.y - BULLET_R, w: BULLET_R * 2, h: BULLET_R * 2 };
  }
}
