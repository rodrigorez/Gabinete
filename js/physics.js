// @ts-check
/* global AFRAME, THREE */

/**
 * Motor de Colisão e Gravidade Kiosk-Level (MVP)
 * Mantém o jogador aterrado e reprime a passagem por dentro de peças do acervo.
 *
 * P7 Correção: Cache da lista de colliders no init(), atualizado via eventos
 * da cena — elimina querySelectorAll() a 60fps (Regra Pétrea 10: Raycast on Demand).
 */

// @ts-ignore
AFRAME.registerComponent('kiosk-physics', {
  schema: {
    height: { type: 'number', default: 1.6 },
    radius: { type: 'number', default: 0.6 },
    collideSelector: { type: 'string', default: '.clickable' }
  },

  init: function () {
    this.keys = {};
    window.addEventListener('keydown', e => { this.keys[e.key.toLowerCase()] = true; });
    window.addEventListener('keyup', e => { this.keys[e.key.toLowerCase()] = false; });

    this.baseHeight = this.data.height;
    this.crouchHeight = this.baseHeight / 2;
    this.velocityY = 0;
    this.gravity = -12.0;
    this.isGrounded = true;
    this.jumpForce = 4.5;

    // P7: Cache inicial de colliders (substitui querySelectorAll no tick)
    this._colliders = [];
    this._tempVec3 = new THREE.Vector3(); // Reutilizado no tick (evita alocação a 60fps)
    this._refreshColliders();

    // Atualiza cache quando objetos são adicionados/removidos da cena dinamicamente
    const sceneEl = this.el.sceneEl;
    if (sceneEl) {
      // @ts-ignore — campos dinâmicos do A-Frame component
      this._onChildAttached = () => this._refreshColliders();
      // @ts-ignore
      this._onChildDetached = () => this._refreshColliders();
      sceneEl.addEventListener('child-attached', this._onChildAttached);
      sceneEl.addEventListener('child-detached', this._onChildDetached);
    }
  },

  /** Atualiza o cache de colliders — chamado apenas quando a cena muda. */
  _refreshColliders: function () {
    this._colliders = Array.from(document.querySelectorAll(this.data.collideSelector));
  },

  tick: function (/** @type {number} */ time, /** @type {number} */ timeDelta) {
    if (!timeDelta) return;
    const dt = timeDelta / 1000;
    const el = this.el;
    // @ts-ignore
    const pos = el.object3D.position;

    // --- CONTROLES AVANÇADOS DE TECLADO MODO FPS ---

    // 1. CORRER (Shift)
    // @ts-ignore
    const wasd = el.components['wasd-controls'];
    if (wasd) {
      if (this.keys['shift']) wasd.data.acceleration = 45;
      else wasd.data.acceleration = 15;
    }

    // 2. ROTAÇÃO (Q e E)
    // @ts-ignore
    const look = el.components['look-controls'];
    if (look && look.yawObject) {
      // @ts-ignore
      if (this.keys['q']) look.yawObject.rotation.y += 1.5 * dt;
      // @ts-ignore
      if (this.keys['e']) look.yawObject.rotation.y -= 1.5 * dt;
    }

    // 3. PULAR (Control / Espaço) e AGACHAR (Alt / C) - COMENTADOS PARA O MVP
    /*
    const wantsJump = this.keys['control'] || this.keys[' '];
    const wantsCrouch = this.keys['alt'] || this.keys['c'];
    const targetHeight = wantsCrouch ? this.crouchHeight : this.baseHeight;

    if (wantsJump && this.isGrounded) {
      this.velocityY = this.jumpForce;
      this.isGrounded = false;
    }

    if (!this.isGrounded) {
      this.velocityY += this.gravity * dt;
      pos.y += this.velocityY * dt;
      if (pos.y <= targetHeight) {
        pos.y = targetHeight;
        this.velocityY = 0;
        this.isGrounded = true;
      }
    } else {
      pos.y += (targetHeight - pos.y) * 10 * dt;
    }
    */
    // Fixando a altura sempre na base (MVP)
    pos.y += (this.baseHeight - pos.y) * 10 * dt;

    // --- COLISÕES OBB (Oriented Bounding Box) ---
    this._colliders.forEach(collider => {
      // @ts-ignore
      const obj3D = collider.object3D;
      if (!obj3D || !obj3D.visible) return;

      // 1. Pega a posição mundial do jogador no centro da Câmera (Cabeça/Olhos)
      const playerWorld = new THREE.Vector3(pos.x, pos.y, pos.z);
      
      // 2. Converte a posição do jogador para o espaço LOCAL da caixa
      const localPos = obj3D.worldToLocal(playerWorld.clone());

      // 3. No espaço local de um a-box, os limites exatos são de -0.5 a 0.5
      const clampedX = Math.max(-0.5, Math.min(0.5, localPos.x));
      const clampedY = Math.max(-0.5, Math.min(0.5, localPos.y));
      const clampedZ = Math.max(-0.5, Math.min(0.5, localPos.z));

      // 4. O ponto mais próximo da caixa ao jogador (em espaço local)
      const closestLocal = new THREE.Vector3(clampedX, clampedY, clampedZ);
      
      // 5. Converte o ponto mais próximo de volta para o MUNDO para verificar a Altura Real
      const closestWorld = obj3D.localToWorld(closestLocal.clone());

      // 6. CILINDRO DO AVATAR: Pés ficam aprox. 1.5m abaixo da câmera, Cabeça 0.2m acima.
      // Se o ponto mais próximo da caixa estiver abaixo da sola do pé ou acima da cabeça, IGNORA.
      // Isso permite que o jogador ande SOBRE tapetes/chãos sem ser arremessado de lado.
      const playerFeet = pos.y - 1.5;
      const playerHead = pos.y + 0.2;
      
      if (closestWorld.y < playerFeet || closestWorld.y > playerHead) {
          return; // Pula essa caixa de colisão, ela não bate no corpo do Avatar.
      }

      // 7. Como o ponto atingiu o corpo (tronco/pernas), tratamos o empurrão como puramente 2D (X/Z).
      closestWorld.y = 0;
      playerWorld.y = 0; // Trava o eixo Y para o cálculo de distância lateral

      let isInside = (localPos.x === clampedX && localPos.y === clampedY && localPos.z === clampedZ);
      
      // 8. Calcula a distância 2D e a direção do push
      const dist = playerWorld.distanceTo(closestWorld);
      const radius = this.data.radius;

      if (dist < radius || isInside) {
        // Impacto confirmado!
        const pushVec = new THREE.Vector3().subVectors(playerWorld, closestWorld);
        
        if (isInside || pushVec.lengthSq() < 0.00001) {
            // Se ele "nasceu" dentro da caixa, empurra para fora do centro.
            // Proteção contra NaN se localPos for exatamente 0,0
            if (Math.abs(localPos.x) < 0.001 && Math.abs(localPos.z) < 0.001) {
                pushVec.set(1, 0, 0); // Empurra pro eixo X arbitrariamente para sair da singularidade
            } else {
                pushVec.set(localPos.x, 0, localPos.z).normalize();
            }
            pos.x += pushVec.x * radius * 0.2;
            pos.z += pushVec.z * radius * 0.2;
        } else {
            // Empurra a câmera de volta para a borda
            pushVec.normalize();
            const overlap = radius - dist;
            pos.x += pushVec.x * overlap;
            pos.z += pushVec.z * overlap;
        }

        // @ts-ignore Debug mode visual feedback
        if (window.GABINETE_DEBUG) {
            // Acesso direto ao material Three.js para performance extrema (60fps)
            // @ts-ignore
            const mesh = collider.getObject3D('mesh');
            if (mesh && mesh.material) {
                // @ts-ignore
                mesh.material.color.setHex(0xffff00); // Amarelo
                // @ts-ignore
                if (collider._debugTimeout) clearTimeout(collider._debugTimeout);
                // @ts-ignore
                collider._debugTimeout = setTimeout(() => {
                    // @ts-ignore
                    if (mesh.material) mesh.material.color.setHex(0xff00ff); // Rosa Choque
                }, 100);
            }
        }
      }
    });
  },

  remove: function () {
    const sceneEl = this.el.sceneEl;
    if (sceneEl) {
      // @ts-ignore — campos dinâmicos do A-Frame component
      sceneEl.removeEventListener('child-attached', this._onChildAttached);
      // @ts-ignore
      sceneEl.removeEventListener('child-detached', this._onChildDetached);
    }
  }
});
