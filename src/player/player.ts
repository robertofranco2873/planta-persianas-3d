import * as THREE from 'three';
import { Character } from './character';
import { Collision } from './collision';
import { Input } from './input';
import { clamp } from '../util/geo';

const R = 0.35;

export class Player {
  ch = new Character({ vest: null, helmet: null, overall: '#6B5545' });
  pos = new THREE.Vector3();
  facing = 0;
  speed = 0;
  camYaw = 0;
  camPitch = 0.35;
  camDist = 6;
  private camDistSmooth = 6;
  drone = false;
  dronePos = new THREE.Vector3();
  droneYaw = 0;
  dronePitch = -0.6;
  bounds = { minX: -40, maxX: 120, minZ: -40, maxZ: 90 };

  constructor(private col: Collision, private camera: THREE.PerspectiveCamera) {}

  spawn(x: number, z: number, lookYaw: number) {
    this.pos.set(x, 0, z);
    this.facing = lookYaw;
    // la cámara mira hacia donde mira el personaje
    this.camYaw = lookYaw + Math.PI;
    this.ch.root.position.copy(this.pos);
    this.ch.root.rotation.y = this.facing;
  }

  setDrone(on: boolean) {
    this.drone = on;
    if (on) {
      this.dronePos.copy(this.camera.position);
      this.dronePos.y = Math.max(this.dronePos.y, 14);
      const dir = new THREE.Vector3(); this.camera.getWorldDirection(dir);
      this.droneYaw = Math.atan2(-dir.x, -dir.z);
      this.dronePitch = -0.7;
    }
  }

  update(dt: number, input: Input, controlsEnabled: boolean) {
    const m = input.mouse();
    const sens = 0.0024;
    if (this.drone) return this.updateDrone(dt, input, m, controlsEnabled);
    if (controlsEnabled) {
      this.camYaw -= m.dx * sens;
      this.camPitch = clamp(this.camPitch + m.dy * sens, -0.25, 1.35);
      this.camDist = clamp(this.camDist + m.wheel * 0.8, 1.8, 16);
    }
    // movimiento relativo a la cámara
    let fx = 0, fz = 0;
    if (controlsEnabled) {
      if (input.down('KeyW') || input.down('ArrowUp')) fz += 1;
      if (input.down('KeyS') || input.down('ArrowDown')) fz -= 1;
      if (input.down('KeyA') || input.down('ArrowLeft')) fx -= 1;
      if (input.down('KeyD') || input.down('ArrowRight')) fx += 1;
    }
    const run = input.down('ShiftLeft') || input.down('ShiftRight');
    const want = fx || fz ? (run ? 5.5 : 2.4) : 0;
    this.speed += (want - this.speed) * Math.min(1, dt * 10);
    if (fx || fz) {
      // dirección "adelante" = de la cámara hacia el personaje
      const fwdX = -Math.sin(this.camYaw), fwdZ = -Math.cos(this.camYaw);
      const rgtX = -fwdZ, rgtZ = fwdX;
      let dx = fwdX * fz + rgtX * fx, dz = fwdZ * fz + rgtZ * fx;
      const l = Math.hypot(dx, dz); dx /= l; dz /= l;
      const target = Math.atan2(dx, dz);
      let d = target - this.facing;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.facing += d * Math.min(1, dt * 12);
      this.pos.x += dx * this.speed * dt;
      this.pos.z += dz * this.speed * dt;
    }
    this.resolve();
    this.ch.root.position.copy(this.pos);
    this.ch.root.rotation.y = this.facing;
    this.ch.animate(dt, this.speed > 3.5 ? 'run' : this.speed > 0.3 ? 'walk' : 'idle', this.speed);
    this.updateCamera(dt);
  }

  resolve() {
    this.col.resolve(this.pos, R);
    this.pos.x = clamp(this.pos.x, this.bounds.minX, this.bounds.maxX);
    this.pos.z = clamp(this.pos.z, this.bounds.minZ, this.bounds.maxZ);
  }
  /** Si quedó encima de algo (p.ej. una máquina que llegó), lo saca al lugar libre más cercano. */
  unstick() {
    if (this.col.blocked(this.pos.x, this.pos.z, R)) {
      const f = this.col.findFree(this.pos.x, this.pos.z, R + 0.05);
      this.pos.x = f.x; this.pos.z = f.z;
      this.ch.root.position.copy(this.pos);
      return true;
    }
    return false;
  }

  private updateCamera(dt: number) {
    const target = new THREE.Vector3(this.pos.x, 1.55, this.pos.z);
    const dir = new THREE.Vector3(Math.sin(this.camYaw) * Math.cos(this.camPitch), Math.sin(this.camPitch), Math.cos(this.camYaw) * Math.cos(this.camPitch));
    const free = this.col.rayDistance(target, dir, this.camDist);
    const dist = Math.max(0.6, free - 0.25);
    // acercar de inmediato, alejar suavemente
    this.camDistSmooth = dist < this.camDistSmooth ? dist : this.camDistSmooth + (dist - this.camDistSmooth) * Math.min(1, dt * 4);
    const p = target.clone().addScaledVector(dir, this.camDistSmooth);
    p.y = Math.max(p.y, 0.3);
    this.camera.position.copy(p);
    this.camera.lookAt(target);
    // ocultar al personaje si la cámara está demasiado cerca
    this.ch.root.visible = this.camDistSmooth > 0.9;
  }

  private updateDrone(dt: number, input: Input, m: { dx: number; dy: number; wheel: number }, enabled: boolean) {
    if (enabled) {
      this.droneYaw -= m.dx * 0.0024;
      this.dronePitch = clamp(this.dronePitch - m.dy * 0.0024, -1.5, 0.6);
    }
    const sp = (input.down('ShiftLeft') ? 30 : 14) * dt;
    const fwd = new THREE.Vector3(-Math.sin(this.droneYaw), 0, -Math.cos(this.droneYaw));
    const rgt = new THREE.Vector3(-fwd.z, 0, fwd.x);
    if (enabled) {
      if (input.down('KeyW')) this.dronePos.addScaledVector(fwd, sp);
      if (input.down('KeyS')) this.dronePos.addScaledVector(fwd, -sp);
      if (input.down('KeyA')) this.dronePos.addScaledVector(rgt, -sp);
      if (input.down('KeyD')) this.dronePos.addScaledVector(rgt, sp);
      if (input.down('Space')) this.dronePos.y += sp;
      if (input.down('KeyC') || input.down('ControlLeft')) this.dronePos.y -= sp;
      this.dronePos.y -= m.wheel * 1.5;
    }
    this.dronePos.y = clamp(this.dronePos.y, 1.5, 90);
    this.dronePos.x = clamp(this.dronePos.x, -60, 140);
    this.dronePos.z = clamp(this.dronePos.z, -60, 110);
    this.camera.position.copy(this.dronePos);
    const look = new THREE.Vector3(-Math.sin(this.droneYaw) * Math.cos(this.dronePitch), Math.sin(this.dronePitch), -Math.cos(this.droneYaw) * Math.cos(this.dronePitch));
    this.camera.lookAt(this.dronePos.clone().add(look));
    this.ch.root.visible = true;
    this.ch.animate(dt, 'idle');
  }
}
