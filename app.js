// app.js - AXP Final Commercial Edition: Speed Step 1.5 per 10 floors

const container = document.getElementById('canvas-container');
container.innerHTML = ''; 

const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
container.appendChild(canvas);

const GAME_WIDTH = 600;
const GAME_HEIGHT = 800;
canvas.width = GAME_WIDTH;
canvas.height = GAME_HEIGHT;
canvas.style.display = 'block';
canvas.style.margin = '0 auto';
canvas.style.backgroundColor = '#f8fafc';

function resizeCanvas() {
    const scale = Math.min(window.innerWidth / GAME_WIDTH, window.innerHeight / GAME_HEIGHT) * 0.95;
    canvas.style.width = `${GAME_WIDTH * scale}px`;
    canvas.style.height = `${GAME_HEIGHT * scale}px`;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas(); 

// ==========================================
// ⚙️ 核心系統與排行榜
// ==========================================
const STATE = { START: 0, PLAYING: 1, PAUSED: 2, GAMEOVER: 3, LEADERBOARD: 4 };
let gameState = STATE.START;

function getLeaderboard() {
    try { return JSON.parse(localStorage.getItem('AXP_Leaderboard')) || []; } 
    catch (e) { return []; }
}

function saveToLeaderboard(name, floors) {
    let lb = getLeaderboard();
    const now = new Date();
    const dateStr = `${now.getFullYear()}/${(now.getMonth()+1).toString().padStart(2,'0')}/${now.getDate().toString().padStart(2,'0')} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
    lb.push({ name, floors, date: dateStr });
    lb.sort((a, b) => b.floors - a.floors);
    lb = lb.slice(0, 10); 
    try { localStorage.setItem('AXP_Leaderboard', JSON.stringify(lb)); } 
    catch (e) { console.warn("無法儲存排行榜資料"); }
}

const MODES = {
    P1_MALE: 1, P1_FEMALE: 2, 
    P2_MALE_FEMALE: 3, P2_MALE_MALE: 4, P2_FEMALE_FEMALE: 5, P2_FEMALE_MALE: 6
};
let selectedSetup = MODES.P1_MALE; 
let gameMode = 1; 

const CONFIG = {
    START_SPEED: 1.5,      
    MAX_SPEED: 4.0,    // 放寬極速，讓 +1.5 可以發揮作用    
    SPEED_STEP: 1.5,   // 每 10 層加速的基準設定   
    GAP_DISTANCE: 165      
};

let currentPlatformSpeed = CONFIG.START_SPEED;

// 競技級別物理手感
const GRAVITY = 0.4;
const MAX_FALL_SPEED = 9.0;
const MAX_MOVE_SPEED = 5.0; 
const MOVE_ACCEL = 1.0; 
const FRICTION = 0.85;

let floorCount = 1;
let platforms = [];
let keys = {};
let bgOffsetY = 0;
let speedPairPending = false; 

const CHAR_TYPES = { MALE_1: 0, MALE_2: 1, FEMALE_1: 2, FEMALE_2: 3 };
let p1CharType = CHAR_TYPES.MALE_1;
let p2CharType = CHAR_TYPES.FEMALE_1;

const CHAR_PALETTES = {
    [CHAR_TYPES.MALE_1]:   { hair: '#8B4513', shirt: '#1B1464', pants: '#ecf0f1', skin: '#ffeaa7', style: 'boy' },      
    [CHAR_TYPES.MALE_2]:   { hair: '#2d3436', shirt: '#c0392b', pants: '#5c2c16', skin: '#ffeaa7', style: 'boy' },      
    [CHAR_TYPES.FEMALE_1]: { hair: '#2d3436', shirt: '#74b9ff', pants: '#e67e22', skin: '#ffeaa7', style: 'girl_pony' },
    [CHAR_TYPES.FEMALE_2]: { hair: '#8B4513', shirt: '#2d3436', pants: '#f5cd79', skin: '#ffeaa7', style: 'girl_short' }
};

const TYPE = { NORMAL: 0, SPIKE: 1, BELT_LEFT: 2, BELT_RIGHT: 3, BONUS: 4, SPEED_UP: 5, SPEED_DOWN: 6 };

// ==========================================
// 🎨 渲染繪圖函式 
// ==========================================

function drawPixelHeart(ctx, x, y, size, isFull) {
    const scaledSize = size * 1.5; 
    ctx.save(); ctx.translate(x, y); ctx.scale(scaledSize, scaledSize);
    ctx.fillStyle = isFull ? '#e74c3c' : '#f1f2f6'; ctx.strokeStyle = '#2c3e50'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 5); ctx.bezierCurveTo(-5, 0, -10, 5, 0, 15); ctx.bezierCurveTo(10, 5, 5, 0, 0, 5); ctx.fill(); ctx.stroke();
    if(isFull) { ctx.fillStyle = '#ff7675'; ctx.beginPath(); ctx.arc(-3, 6, 1.5, 0, Math.PI*2); ctx.fill(); }
    ctx.restore();
}

function drawFriendlyCharacter(ctx, x, y, charType, facingRight, animFrame, isDead, damageCooldown) {
    if (isDead || (damageCooldown > 0 && Math.floor(Date.now() / 50) % 2 === 0)) return;
    const p = CHAR_PALETTES[charType];
    
    ctx.save(); ctx.translate(x, y); 
    if (!facingRight) ctx.scale(-1, 1); 
    
    ctx.fillStyle = p.skin; 
    ctx.beginPath(); ctx.roundRect(-12, -18, 24, 20, 6); ctx.fill(); 
    ctx.beginPath(); ctx.roundRect(10, -9, 4, 4, 2); ctx.fill();

    ctx.fillStyle = '#2d3436'; 
    ctx.beginPath(); ctx.arc(2, -10, 2.5, 0, Math.PI*2); ctx.fill(); 
    ctx.beginPath(); ctx.arc(9, -10, 2.5, 0, Math.PI*2); ctx.fill(); 
    ctx.strokeStyle = '#2d3436'; ctx.lineWidth = 1.5; 
    ctx.beginPath(); ctx.arc(5.5, -4, 3, 0, Math.PI); ctx.stroke(); 
    
    ctx.fillStyle = p.shirt; 
    ctx.beginPath(); ctx.roundRect(-9, 2, 18, 16, 4); ctx.fill(); ctx.strokeRect(-9, 2, 18, 16); 
    ctx.fillStyle = p.pants; 
    ctx.beginPath(); ctx.moveTo(-3, 2); ctx.lineTo(3, 2); ctx.lineTo(0, 7); ctx.fill();
    
    ctx.fillStyle = p.pants; 
    const swing = Math.sin(animFrame) * 6;
    ctx.beginPath(); ctx.roundRect(-7 + swing/2, 18, 6, 12, 2); ctx.fill(); 
    ctx.fillRect(-7 + swing/2, 27, 8, 3); 
    ctx.beginPath(); ctx.roundRect(1 - swing/2, 18, 6, 12, 2); ctx.fill(); 
    ctx.fillRect(1 - swing/2, 27, 8, 3); 

    ctx.fillStyle = p.skin; 
    ctx.beginPath(); ctx.arc(-3 - swing, 13, 3.5, 0, Math.PI*2); ctx.fill(); 
    ctx.beginPath(); ctx.arc(5 + swing, 13, 3.5, 0, Math.PI*2); ctx.fill(); 
    ctx.fillStyle = p.shirt;
    ctx.beginPath(); ctx.arc(-3 - swing, 8, 4.5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(5 + swing, 8, 4.5, 0, Math.PI*2); ctx.fill();

    ctx.fillStyle = p.hair;
    if (p.style === 'boy') {
        ctx.beginPath(); ctx.roundRect(-13, -20, 26, 8, 4); ctx.fill(); 
        ctx.fillRect(0, -14, 16, 4); 
    } else if (p.style === 'girl_pony') {
        ctx.beginPath(); ctx.roundRect(-13, -20, 26, 8, 4); ctx.fill(); 
        ctx.beginPath(); ctx.arc(-14, -12, 6, 0, Math.PI*2); ctx.fill(); 
        ctx.save(); ctx.translate(-14, -12); ctx.rotate(Math.sin(animFrame) * 0.2 + 0.2); ctx.beginPath(); ctx.ellipse(-6, 8, 4, 14, -0.3, 0, Math.PI*2); ctx.fill(); ctx.restore();
    } else if (p.style === 'girl_short') {
        ctx.beginPath(); ctx.roundRect(-13, -20, 26, 10, 4); ctx.fill();
        ctx.fillRect(-13, -10, 6, 12); 
        ctx.fillRect(7, -10, 4, 8); 
    }
    ctx.restore();
}

function drawPremiumPlatform(ctx, x, y, w, h, type, timeOffset) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath(); ctx.roundRect(x, y + 4, w, h, 6); ctx.fill();

    ctx.beginPath();
    if (type === TYPE.BELT_LEFT || type === TYPE.BELT_RIGHT) {
        ctx.arc(x + h/2, y + h/2, h/2, Math.PI/2, Math.PI*1.5); ctx.lineTo(x + w - h/2, y); ctx.arc(x + w - h/2, y + h/2, h/2, Math.PI*1.5, Math.PI/2);
    } else { ctx.roundRect(x, y, w, h, 6); }
    ctx.closePath();

    let topC = '#f1f5f9', midC = '#e2e8f0', botC = '#64748b';
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, topC); grad.addColorStop(0.3, midC); grad.addColorStop(1, botC); 
    ctx.fillStyle = grad; ctx.fill();
    ctx.strokeStyle = '#475569'; ctx.lineWidth = 1.5; ctx.stroke();

    ctx.save(); ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2;
    if (type === TYPE.BELT_LEFT || type === TYPE.BELT_RIGHT) {
        ctx.beginPath(); ctx.arc(x + h/2, y + h/2, h/2 - 1, Math.PI/2, Math.PI*1.5); ctx.lineTo(x + w - h/2, y + 1); ctx.arc(x + w - h/2, y + h/2, h/2 - 1, Math.PI*1.5, Math.PI/2); ctx.closePath(); ctx.stroke();
    } else { ctx.strokeRect(x + 1, y + 1, w - 2, h - 2); }
    ctx.restore();

    if (type === TYPE.BELT_LEFT || type === TYPE.BELT_RIGHT) {
        ctx.save(); ctx.clip();
        ctx.fillStyle = type === TYPE.BELT_LEFT ? 'rgba(52, 152, 219, 0.2)' : 'rgba(155, 89, 182, 0.2)'; ctx.fillRect(x, y, w, h);
        const dir = type === TYPE.BELT_LEFT ? 'left' : 'right';
        for (let i = -20; i < w + 40; i += 45) {
            const shift = type === TYPE.BELT_LEFT ? (i - timeOffset * 12) % (w + 40) : (i + timeOffset * 12) % (w + 40);
            const drawX = shift < -20 ? w + 40 + shift : shift;
            ctx.save(); ctx.translate(x + drawX, y + h/2); if (dir === 'left') ctx.scale(-1, 1);
            ctx.fillStyle = dir === 'left' ? '#2980b9' : '#8e44ad'; 
            ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(2, 6); ctx.lineTo(2, -6); ctx.closePath(); ctx.fill();
            ctx.fillRect(-2, -3, 2, 6); ctx.fillRect(-6, -3, 2, 6);
            ctx.restore();
        }
        ctx.restore();
    }

    const rx1 = x + (type===TYPE.BELT_LEFT||type===TYPE.BELT_RIGHT ? h/2 : 12);
    const rx2 = x + w - (type===TYPE.BELT_LEFT||type===TYPE.BELT_RIGHT ? h/2 : 12);
    ctx.fillStyle = '#334155'; ctx.beginPath(); ctx.arc(rx1, y+h/2, 2.5, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(rx2, y+h/2, 2.5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(rx1 - 0.5, y+h/2 - 0.5, 1, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(rx2 - 0.5, y+h/2 - 0.5, 1, 0, Math.PI*2); ctx.fill();

    ctx.restore();
}

function drawSpikes(ctx, x, y, w) {
    for (let i = 0; i < w; i += 16) {
        const spikeW = Math.min(16, w - i);
        const sx = x + i;
        const grad = ctx.createLinearGradient(sx, y, sx + spikeW, y);
        grad.addColorStop(0, '#94a3b8'); grad.addColorStop(0.5, '#f8fafc'); grad.addColorStop(1, '#475569');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.moveTo(sx, y); ctx.lineTo(sx + spikeW/2, y - 24); ctx.lineTo(sx + spikeW, y); ctx.fill();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(sx + spikeW/2, y - 24); ctx.lineTo(sx + spikeW/2, y); ctx.stroke();
    }
}

function drawSpeedArrows(ctx, x, y, type) {
    ctx.save();
    ctx.strokeStyle = type === TYPE.SPEED_UP ? '#e74c3c' : '#0984e3'; 
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (let i = -15; i <= 15; i += 15) {
        ctx.beginPath();
        if (type === TYPE.SPEED_UP) {
            ctx.moveTo(x + i - 6, y + 4); ctx.lineTo(x + i, y - 6); ctx.lineTo(x + i + 6, y + 4);
        } else {
            ctx.moveTo(x + i - 6, y - 6); ctx.lineTo(x + i, y + 4); ctx.lineTo(x + i + 6, y - 6);
        }
        ctx.stroke();
    }
    ctx.restore();
}

// ==========================================
// 玩家類別
// ==========================================
class Player {
    constructor(id, controls) {
        this.id = id; this.controls = controls; 
        this.width = 24; this.height = 36;
        this.startX = id === '1P' ? GAME_WIDTH/2 - 60 : GAME_WIDTH/2 + 60;
        this.reset(true);
    }
    reset(fullReset = false) {
        if (fullReset) this.revivesLeft = 3; 
        this.x = (gameMode === 1 && this.id === '1P') ? GAME_WIDTH / 2 : this.startX;
        this.y = 100; this.vx = 0; this.vy = 0; 
        this.life = 8; this.maxLife = 8;
        this.isDead = false; 
        this.damageCooldown = 150; 
        this.facingRight = true; this.animFrame = 0;
        this.charType = this.id === '1P' ? p1CharType : p2CharType;
    }
    update() {
        if (this.isDead) return;
        
        if (keys[this.controls.left]) this.vx -= MOVE_ACCEL;
        else if (keys[this.controls.right]) this.vx += MOVE_ACCEL;
        else this.vx = 0; 

        if (this.vx > MAX_MOVE_SPEED) this.vx = MAX_MOVE_SPEED;
        if (this.vx < -MAX_MOVE_SPEED) this.vx = -MAX_MOVE_SPEED;
        this.x += this.vx;

        if (this.vx > 0.5) this.facingRight = true; else if (this.vx < -0.5) this.facingRight = false;
        if (this.x < 0) this.x = GAME_WIDTH; if (this.x > GAME_WIDTH) this.x = 0;
        
        this.vy += GRAVITY; 
        if (keys[this.controls.down]) this.vy += 0.5;
        if (this.vy > MAX_FALL_SPEED) this.vy = MAX_FALL_SPEED;
        this.y += this.vy;
        
        if (this.damageCooldown > 0) this.damageCooldown--;
        this.animFrame += Math.abs(this.vx) * 0.15;
        
        if (this.y > GAME_HEIGHT || this.life <= 0) {
            if (this.revivesLeft > 0) {
                this.revivesLeft--;
                this.life = this.maxLife;
                let safePlatforms = platforms.filter(p => p.y > 100 && p.y < GAME_HEIGHT - 200 && p.type !== TYPE.SPIKE);
                let safeP = safePlatforms.length > 0 ? safePlatforms[0] : platforms[0];
                this.x = safeP.x + safeP.width / 2;
                this.y = safeP.y - 100;
                this.vy = 0;
                this.damageCooldown = 150; 
            } else {
                this.isDead = true;
            }
        }
    }
    draw(ctx) {
        drawFriendlyCharacter(ctx, this.x, this.y - this.height/2 + 4, this.charType, this.facingRight, this.animFrame, this.isDead, this.damageCooldown);
    }
}

const p1 = new Player('1P', { left: 'ArrowLeft', right: 'ArrowRight', down: 'ArrowDown' }); 
const p2 = new Player('2P', { left: 'KeyA', right: 'KeyD', down: 'KeyS' });

// ==========================================
// 平台系統與精準機率
// ==========================================
function generatePlatformData() {
    let type = TYPE.NORMAL; let items = [];
    const baseRand = Math.random();
    
    if (baseRand < 0.20) type = TYPE.SPIKE;
    else if (baseRand < 0.35) type = TYPE.BELT_LEFT;
    else if (baseRand < 0.50) type = TYPE.BELT_RIGHT;
    
    if (type === TYPE.NORMAL || type === TYPE.BELT_LEFT || type === TYPE.BELT_RIGHT) {
        let itemRand = Math.random();
        if (itemRand < 0.25) {
            type = TYPE.BONUS; 
            const heartCount = Math.floor(Math.random() * 3) + 1; 
            for(let i=0; i<heartCount; i++) items.push('heart');
        } else if (itemRand >= 0.25 && itemRand < 0.28) {
            type = TYPE.SPEED_UP; items.push('speedup');
        } else if (itemRand >= 0.28 && itemRand < 0.38) {
            type = TYPE.SPEED_DOWN; items.push('speeddown');
        }
    }
    return { type, items };
}

function createPlatform(y, isFirst = false) {
    if (isFirst) {
        platforms.push({ x: GAME_WIDTH / 2 - 120, y, width: 240, height: 28, type: TYPE.NORMAL, items: [] });
        return;
    }
    const twoPlatforms = Math.random() < 0.4;
    if (twoPlatforms) {
        let w1 = 80 + Math.random() * 60; let x1 = Math.random() * (GAME_WIDTH / 2 - w1);
        let data1 = generatePlatformData(); platforms.push({ x: x1, y, width: w1, height: 28, type: data1.type, items: data1.items });
        let w2 = 80 + Math.random() * 60; let x2 = GAME_WIDTH / 2 + Math.random() * (GAME_WIDTH / 2 - w2);
        let data2 = generatePlatformData(); platforms.push({ x: x2, y, width: w2, height: 28, type: data2.type, items: data2.items });
    } else {
        let w = 150 + Math.random() * 100;
        let prevP = platforms[platforms.length - 1];
        let minX = Math.max(0, prevP.x - w + 40); let maxX = Math.min(GAME_WIDTH - w, prevP.x + prevP.width - 40);
        if (maxX < minX) { minX = 0; maxX = GAME_WIDTH - w; } 
        let x = minX + Math.random() * (maxX - minX);
        let data = generatePlatformData(); platforms.push({ x, y, width: w, height: 28, type: data.type, items: data.items });
    }
}

function initPlatforms() {
    platforms = []; 
    createPlatform(300, true);
    let currentY = 300;
    for (let i = 1; i < 7; i++) { currentY += CONFIG.GAP_DISTANCE; createPlatform(currentY); }
}

function checkGameOver() {
    if (gameState !== STATE.PLAYING) return;
    if ((gameMode === 1 && p1.isDead) || (gameMode === 2 && p1.isDead && p2.isDead)) {
        gameState = STATE.GAMEOVER;
        setTimeout(() => {
            const lb = getLeaderboard();
            if (lb.length < 10 || floorCount > lb[lb.length-1].floors) {
                const name = prompt("🎉 破紀錄啦！請輸入你的大名：", "匿名特工");
                if (name) saveToLeaderboard(name, floorCount);
            }
            gameState = STATE.LEADERBOARD;
        }, 800);
    }
}

function update() {
    if (gameState !== STATE.PLAYING) return;
    p1.update(); if (gameMode === 2) p2.update();
    checkGameOver();

    platforms.forEach(p => p.y -= currentPlatformSpeed);

    if (platforms.length > 0 && platforms[0].y < -50) {
        platforms.shift(); floorCount++;
        
        // 【修改】每 10 層觸發自動加速，一次增加 1.5 
        if (floorCount % 10 === 0 && currentPlatformSpeed < CONFIG.MAX_SPEED) {
            currentPlatformSpeed = Math.min(CONFIG.MAX_SPEED, currentPlatformSpeed + 1.5);
        }
    }

    let lastPlatform = platforms[platforms.length - 1];
    if (lastPlatform.y < GAME_HEIGHT) createPlatform(lastPlatform.y + CONFIG.GAP_DISTANCE);

    let activePlayers = gameMode === 1 ? [p1] : [p1, p2];
    activePlayers.forEach(player => {
        if(player.isDead) return;

        if (player.y - player.height/2 <= 15) {
            if (player.damageCooldown <= 0) { player.life -= 2; player.damageCooldown = 100; }
            player.y += 30; player.vy = 2;
        }

        for (let p of platforms) {
            const playerBottom = player.y + player.height/2; const platformTop = p.y;
            if (player.x + player.width/2 > p.x && player.x - player.width/2 < p.x + p.width) {
                if (playerBottom >= platformTop && playerBottom - player.vy <= platformTop + 20) {
                    player.y = platformTop - player.height/2; player.vy = -currentPlatformSpeed; 
                    
                    if (p.items && p.items.length > 0) {
                        let newItems = [];
                        p.items.forEach(item => {
                            if (item === 'heart') {
                                if (player.life < player.maxLife) { player.life = Math.min(player.maxLife, player.life + 2); } 
                                else { newItems.push(item); }
                            } else if (item === 'speedup') { currentPlatformSpeed = Math.min(CONFIG.MAX_SPEED, currentPlatformSpeed + 0.2); } 
                            else if (item === 'speeddown') { currentPlatformSpeed = Math.max(1.0, currentPlatformSpeed - 0.6); }
                        });
                        p.items = newItems; if(p.items.length === 0) p.type = TYPE.NORMAL; 
                    }

                    if (p.type === TYPE.SPIKE) {
                        if (player.damageCooldown <= 0) { player.life -= 2; player.damageCooldown = 100; }
                    } else if (p.type === TYPE.BELT_LEFT) { player.x -= 3.0; }
                    else if (p.type === TYPE.BELT_RIGHT) { player.x += 3.0; }
                    break; 
                }
            }
        }
    });
    bgOffsetY = (bgOffsetY + currentPlatformSpeed * 0.2) % 40;
}

// ==========================================
// 繪圖引擎
// ==========================================
function drawBackground() {
    ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 2; ctx.beginPath();
    for(let i = 0; i < GAME_WIDTH; i += 40) { ctx.moveTo(i, 0); ctx.lineTo(i, GAME_HEIGHT); }
    for(let j = -40; j < GAME_HEIGHT; j += 40) { ctx.moveTo(0, j - bgOffsetY); ctx.lineTo(GAME_WIDTH, j - bgOffsetY); }
    ctx.stroke();
}

function drawPlatforms() {
    const timeOffset = Date.now() / 150;
    platforms.forEach(p => {
        drawPremiumPlatform(ctx, p.x, p.y, p.width, p.height, p.type, timeOffset);

        if (p.type === TYPE.SPIKE) drawSpikes(ctx, p.x, p.y, p.width);
        
        if (p.items && p.items.length > 0) {
            let heartRendered = 0;
            p.items.forEach((item) => {
                if (item === 'heart') {
                    const spacing = 35;
                    const totalHearts = p.items.filter(i => i==='heart').length;
                    const startX = (p.x + p.width/2) - ((totalHearts-1) * spacing / 2);
                    drawPixelHeart(ctx, startX + (heartRendered * spacing), p.y - 20, 1.2, true); heartRendered++;
                } else if (item === 'speedup') { drawSpeedArrows(ctx, p.x + p.width/2, p.y + p.height/2, TYPE.SPEED_UP); } 
                else if (item === 'speeddown') { drawSpeedArrows(ctx, p.x + p.width/2, p.y + p.height/2, TYPE.SPEED_DOWN); }
            });
        }
    });
    drawPremiumPlatform(ctx, 0, 0, GAME_WIDTH, 15, TYPE.NORMAL, 0);
}

function drawHUD() {
    if (gameState === STATE.START) return;
    
    const panelGrad = ctx.createLinearGradient(20, 20, 20, 100);
    panelGrad.addColorStop(0, '#f8fafc'); panelGrad.addColorStop(0.5, '#e2e8f0'); panelGrad.addColorStop(1, '#cbd5e1');
    ctx.fillStyle = panelGrad; ctx.shadowColor = 'rgba(0,0,0,0.15)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 4;
    ctx.beginPath(); ctx.roundRect(20, 20, 250, 80, 8); ctx.fill(); ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 2; ctx.stroke();

    const drawLife = (player, x, y, label) => {
        if(player.isDead) return;
        ctx.save(); ctx.translate(x + 35, y + 40); ctx.scale(0.8, 0.8); 
        drawFriendlyCharacter(ctx, 0, 0, player.charType, true, 0, false, 0); ctx.restore();
        
        ctx.fillStyle = '#2f3542'; ctx.font = 'bold 16px Arial'; ctx.textAlign = 'left'; 
        ctx.fillText(label, x + 50, y + 30);
        
        ctx.fillStyle = '#e67e22'; ctx.font = 'bold 14px Arial';
        ctx.fillText(`👼 復活: ${player.revivesLeft}`, x + 150, y + 30);

        for (let i = 0; i < 4; i++) drawPixelHeart(ctx, x + 30 + (i * 22), y - 5, 0.9, player.life >= (i+1)*2);
    };
    drawLife(p1, 20, 40, '1P'); if(gameMode === 2) drawLife(p2, 130, 40, '2P');

    ctx.fillStyle = '#2f3542'; ctx.font = 'bold 36px "Orbitron", monospace'; ctx.textAlign = 'left';
    ctx.fillText(`第 ${String(floorCount).padStart(4, '0')} 層`, 290, 70);
    ctx.strokeStyle = '#cbd5e1'; ctx.beginPath(); ctx.moveTo(290, 85); ctx.lineTo(490, 85); ctx.stroke();
    
    ctx.fillStyle = '#e1b12c'; ctx.font = 'bold 16px Arial';
    ctx.fillText(`SPEED: ${currentPlatformSpeed.toFixed(1)}`, 290, 110);
}

function drawUI() {
    if (gameState === STATE.START) {
        ctx.fillStyle = 'rgba(248, 250, 252, 0.95)'; ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        ctx.fillStyle = '#2d3436'; ctx.textAlign = 'center'; ctx.font = 'bold 50px Arial'; 
        ctx.fillText('瘋狂下樓梯', GAME_WIDTH / 2, 140);
        ctx.fillStyle = '#64748b'; ctx.font = 'bold 18px Arial'; ctx.fillText('請使用滑鼠點擊選擇對戰編組', GAME_WIDTH / 2, 190);

        const drawBtn = (id, label, x, y, mode, isP2) => {
            const sel = selectedSetup === mode;
            ctx.fillStyle = sel ? (isP2 ? '#f39c12' : '#0984e3') : '#ffffff';
            ctx.strokeStyle = sel ? '#2d3436' : '#cbd5e1'; ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.roundRect(x, y, 250, 75, 10); ctx.fill(); ctx.stroke();
            ctx.fillStyle = sel ? '#ffffff' : '#2d3436'; ctx.font = 'bold 16px Arial'; ctx.textAlign = 'left';
            ctx.fillText(`按鍵 ${id} : ${label}`, x + 15, y + 30);

            ctx.save(); ctx.translate(x + 180, y + 35); ctx.scale(0.6, 0.6); 
            if (mode === MODES.P1_MALE) drawFriendlyCharacter(ctx, 0, 0, CHAR_TYPES.MALE_1, true, 0, false, 0);
            else if (mode === MODES.P1_FEMALE) drawFriendlyCharacter(ctx, 0, 0, CHAR_TYPES.FEMALE_1, true, 0, false, 0);
            else if (mode === MODES.P2_MALE_FEMALE) { drawFriendlyCharacter(ctx, -15, 0, CHAR_TYPES.MALE_1, true, 0, false, 0); drawFriendlyCharacter(ctx, 15, 0, CHAR_TYPES.FEMALE_1, true, 0, false, 0); }
            else if (mode === MODES.P2_MALE_MALE) { drawFriendlyCharacter(ctx, -15, 0, CHAR_TYPES.MALE_1, true, 0, false, 0); drawFriendlyCharacter(ctx, 15, 0, CHAR_TYPES.MALE_2, true, 0, false, 0); }
            else if (mode === MODES.P2_FEMALE_FEMALE) { drawFriendlyCharacter(ctx, -15, 0, CHAR_TYPES.FEMALE_1, true, 0, false, 0); drawFriendlyCharacter(ctx, 15, 0, CHAR_TYPES.FEMALE_2, true, 0, false, 0); }
            else if (mode === MODES.P2_FEMALE_MALE) { drawFriendlyCharacter(ctx, -15, 0, CHAR_TYPES.FEMALE_1, true, 0, false, 0); drawFriendlyCharacter(ctx, 15, 0, CHAR_TYPES.MALE_1, true, 0, false, 0); }
            ctx.restore();
        };

        ctx.fillStyle = '#2f3542'; ctx.font = 'bold 18px Arial'; ctx.textAlign = 'left'; ctx.fillText('【 1P 單人 】', 40, 240);
        drawBtn(1, '男 1 號 ♂', 40, 260, MODES.P1_MALE, false); drawBtn(2, '女 1 號 ♀', 40, 350, MODES.P1_FEMALE, false);
        ctx.fillStyle = '#2f3542'; ctx.fillText('【 2P 雙打 】', 310, 240);
        drawBtn(3, '1男 & 2女', 310, 260, MODES.P2_MALE_FEMALE, true); drawBtn(4, '1男 & 2男', 310, 350, MODES.P2_MALE_MALE, true);
        drawBtn(5, '1女 & 2女', 310, 440, MODES.P2_FEMALE_FEMALE, true); drawBtn(6, '1女 & 2男', 310, 530, MODES.P2_FEMALE_MALE, true);

        ctx.fillStyle = '#ff7675'; ctx.font = 'bold 24px Arial'; ctx.textAlign = 'center';
        if (Math.floor(Date.now() / 500) % 2 === 0) ctx.fillText('PRESS ENTER TO START', GAME_WIDTH / 2, GAME_HEIGHT - 80);
    }

    if (gameState === STATE.PAUSED) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'; ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'; ctx.shadowColor = 'rgba(0,0,0,0.2)'; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.roundRect(GAME_WIDTH/2 - 160, GAME_HEIGHT/2 - 60, 320, 120, 12); ctx.fill(); ctx.shadowColor = 'transparent';
        ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#2d3436'; ctx.textAlign = 'center'; ctx.font = 'bold 32px Arial'; ctx.fillText('GAME PAUSED', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 10);
        ctx.font = 'bold 16px Arial'; ctx.fillText('PRESS SPACE', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 40);
    }

    if (gameState === STATE.GAMEOVER) {
        ctx.fillStyle = 'rgba(248, 250, 252, 0.9)'; ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        ctx.fillStyle = '#d63031'; ctx.textAlign = 'center'; ctx.font = 'bold 56px Arial'; ctx.fillText('GAME OVER', GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20);
    }

    if (gameState === STATE.LEADERBOARD) {
        ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        ctx.fillStyle = '#38bdf8'; ctx.textAlign = 'center'; ctx.font = 'bold 40px Arial'; 
        ctx.fillText('🏆 TOP 10 排行榜', GAME_WIDTH / 2, 80);

        const lb = getLeaderboard();
        ctx.fillStyle = '#94a3b8'; ctx.font = 'bold 18px Arial'; ctx.textAlign = 'left'; 
        ctx.fillText('排名', 60, 140); ctx.fillText('代號', 130, 140); ctx.fillText('樓層', 320, 140); ctx.fillText('時間', 420, 140);
        ctx.strokeStyle = '#334155'; ctx.beginPath(); ctx.moveTo(50, 150); ctx.lineTo(550, 150); ctx.stroke();

        ctx.font = '18px Arial';
        lb.forEach((entry, i) => {
            const y = 190 + i * 40;
            ctx.fillStyle = i < 3 ? '#fbbf24' : '#cbd5e1'; ctx.fillText(`# ${i+1}`, 60, y);
            ctx.fillStyle = '#f8fafc'; ctx.fillText(entry.name.substring(0,8), 130, y);
            ctx.fillStyle = '#f87171'; ctx.fillText(`${entry.floors} 層`, 320, y);
            ctx.fillStyle = '#64748b'; ctx.font = '14px Arial'; ctx.fillText(entry.date, 420, y); ctx.font = '18px Arial';
        });

        ctx.fillStyle = '#0284c7'; ctx.beginPath(); ctx.roundRect(GAME_WIDTH/2 - 120, 700, 240, 50, 8); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = 'bold 20px Arial'; ctx.fillText('按 ENTER 返回', GAME_WIDTH/2, 732);
    }
}

window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'Space') { if (gameState === STATE.PLAYING) gameState = STATE.PAUSED; else if (gameState === STATE.PAUSED) gameState = STATE.PLAYING; e.preventDefault(); }
    if (gameState === STATE.START) {
        if (e.code === 'Digit1') selectedSetup = MODES.P1_MALE; if (e.code === 'Digit2') selectedSetup = MODES.P1_FEMALE;
        if (e.code === 'Digit3') selectedSetup = MODES.P2_MALE_FEMALE; if (e.code === 'Digit4') selectedSetup = MODES.P2_MALE_MALE;
        if (e.code === 'Digit5') selectedSetup = MODES.P2_FEMALE_FEMALE; if (e.code === 'Digit6') selectedSetup = MODES.P2_FEMALE_MALE;
        if (e.code === 'Enter') startGame();
    } else if (gameState === STATE.LEADERBOARD && e.code === 'Enter') gameState = STATE.START;
});
window.addEventListener('keyup', (e) => keys[e.code] = false);

canvas.addEventListener('mousedown', (e) => {
    if (gameState !== STATE.START) return;
    const rect = canvas.getBoundingClientRect(); const mx = (e.clientX - rect.left) * (canvas.width / rect.width); const my = (e.clientY - rect.top) * (canvas.height / rect.height);
    if (mx > 40 && mx < 290) { if (my > 260 && my < 335) selectedSetup = MODES.P1_MALE; if (my > 350 && my < 425) selectedSetup = MODES.P1_FEMALE; }
    if (mx > 310 && mx < 560) {
        if (my > 260 && my < 335) selectedSetup = MODES.P2_MALE_FEMALE; if (my > 350 && my < 425) selectedSetup = MODES.P2_MALE_MALE;
        if (my > 440 && my < 515) selectedSetup = MODES.P2_FEMALE_FEMALE; if (my > 530 && my < 605) selectedSetup = MODES.P2_FEMALE_MALE;
    }
});

function startGame() {
    floorCount = 1; currentPlatformSpeed = CONFIG.START_SPEED; 
    if (selectedSetup <= 2) { gameMode = 1; p1CharType = selectedSetup === MODES.P1_MALE ? CHAR_TYPES.MALE_1 : CHAR_TYPES.FEMALE_1; } 
    else {
        gameMode = 2; 
        if (selectedSetup === MODES.P2_MALE_FEMALE) { p1CharType = CHAR_TYPES.MALE_1; p2CharType = CHAR_TYPES.FEMALE_1; }
        else if (selectedSetup === MODES.P2_MALE_MALE) { p1CharType = CHAR_TYPES.MALE_1; p2CharType = CHAR_TYPES.MALE_2; }
        else if (selectedSetup === MODES.P2_FEMALE_FEMALE) { p1CharType = CHAR_TYPES.FEMALE_1; p2CharType = CHAR_TYPES.FEMALE_2; }
        else if (selectedSetup === MODES.P2_FEMALE_MALE) { p1CharType = CHAR_TYPES.FEMALE_1; p2CharType = CHAR_TYPES.MALE_1; }
    }
    initPlatforms(); p1.reset(true); p2.reset(true); gameState = STATE.PLAYING;
}

function gameLoop() {
    if (gameState === STATE.PLAYING) update(); 
    drawBackground(); 
    if (gameState === STATE.PLAYING || gameState === STATE.PAUSED || gameState === STATE.GAMEOVER) {
        drawPlatforms(); if(!p1.isDead) p1.draw(ctx); if(gameMode === 2 && !p2.isDead) p2.draw(ctx); 
    }
    drawHUD(); drawUI();
    requestAnimationFrame(gameLoop);
}

initPlatforms(); gameLoop();