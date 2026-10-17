// Start screen, battle setup, online lobby, game-over screen and the sound toggle.
import { G, S, setRecording } from './state.js';
import { startBattle, setupBattle, resetToMenu } from './sim.js';
import { invalidateWeapons, setPerspective } from './render.js';
import { ac, isSoundOn, setSoundOn } from './audio.js';
import { randomSeed } from './rng.js';
import { clearFx } from './fx.js';
import { esc } from './util.js';
import * as net from './net.js';

// mode: 'local' | 'host' | 'guest'. frozen: the online match was interrupted.
export const session = { mode: 'local', frozen: false };

var OVERLAYS = ['start', 'menu', 'join', 'guestWait', 'netLost', 'over'];
var lastCfg = null, pendingCfg = null, inMatch = false, roomCode = '';

function $(id) { return document.getElementById(id); }
function show(id) {
  OVERLAYS.forEach(function (o) { $(o).hidden = o !== id; });
  if (!id) return;
  var els = $(id).querySelectorAll('input, button');
  for (var i = 0; i < els.length; i++) {
    if (!els[i].disabled && els[i].offsetParent !== null) { els[i].focus(); return; }
  }
}
function setStatus(id, text, kind) {
  var el = $(id);
  el.textContent = text || '';
  el.className = 'status' + (kind ? ' ' + kind : '');
  el.hidden = !text;
}
function setNet(state) {
  var el = $('netStatus');
  if (!state) { el.hidden = true; return; }
  el.hidden = false;
  el.dataset.state = state;
  el.textContent = { connecting: 'Connecting…', waiting: 'Waiting for opponent', connected: 'Connected', disconnected: 'Disconnected' }[state];
}

function readCfg() {
  return {
    names: [$('n0').value.trim() || 'Red Team', $('n1').value.trim() || 'Blue Team'],
    hp: parseInt($('hp').value, 10),
    style: $('style').value
  };
}
function withNewSeed(cfg) { return Object.assign({}, cfg, { seed: randomSeed() }); }

function enterBattle() {
  inMatch = true;
  show(null);
  invalidateWeapons();
  $('cv').focus();
}

/* ---------- Local ---------- */
function openLocalSetup() {
  session.mode = 'local';
  setPerspective(-1);
  $('roomPanel').hidden = true;
  $('setupText').textContent = 'Pick names and rules. Red goes first.';
  $('startBtn').disabled = false;
  show('menu');
}
function beginLocal(cfg) {
  lastCfg = cfg;
  clearFx();
  startBattle(withNewSeed(cfg));
  enterBattle();
}
// Starts a local battle on a freshly rolled map (also used by the test hook).
export function beginBattle(cfg) {
  session.mode = 'local';
  setPerspective(-1);
  beginLocal(cfg);
}

/* ---------- Host ---------- */
function openHostRoom() {
  session.mode = 'host'; session.frozen = false;
  setPerspective(net.HOST_TEAM);
  inMatch = false; pendingCfg = null; roomCode = '';
  $('roomPanel').hidden = false;
  $('roomCode').textContent = '······';
  $('copyCode').disabled = true;
  $('setupText').textContent = 'You play as the red team. Share the room code with a friend, then pick the map and names.';
  $('startBtn').disabled = true;
  setStatus('roomStatus', 'Creating room…');
  setNet('connecting');
  show('menu');
  net.hostRoom({
    onRoom: function (code) {
      roomCode = code;
      $('roomCode').textContent = code;
      $('copyCode').disabled = false;
      setStatus('roomStatus', 'Waiting for an opponent to join…');
      setNet('waiting');
    },
    onConnected: function () {
      setStatus('roomStatus', 'Opponent connected. Start when you are ready.', 'ok');
      $('startBtn').disabled = false;
      setNet('connected');
    },
    onReady: function () {
      if (pendingCfg) startHostBattle(pendingCfg);
    },
    onLost: function () {
      if (inMatch || pendingCfg || !$('over').hidden) { interrupted('The connection to your opponent was lost.'); return; }
      setStatus('roomStatus', 'Your opponent left. Waiting for someone to join…');
      $('startBtn').disabled = true;
      setNet('waiting');
    },
    onError: function (msg) {
      setStatus('roomStatus', msg, 'error');
      $('startBtn').disabled = true;
      setNet('disconnected');
    },
    canAccept: function () { return !session.frozen && !inMatch; }
  });
}
function requestHostBattle(cfg) {
  if (!net.isConnected()) return;
  pendingCfg = withNewSeed(cfg);
  lastCfg = cfg;
  net.sendInit(pendingCfg);
  $('startBtn').disabled = true;
  setStatus('roomStatus', 'Waiting for your opponent to load the map…');
  setStatus('overStatus', 'Waiting for your opponent to load the map…');
  $('rematch').disabled = true;
}
function startHostBattle(cfg) {
  pendingCfg = null;
  clearFx();
  setRecording(true);
  startBattle(cfg);
  net.startStreaming();
  enterBattle();
}
function hostBackToRoom() {
  net.sendWait();
  inMatch = false; pendingCfg = null;
  setRecording(false);
  resetToMenu(); clearFx();
  setStatus('roomStatus', net.isConnected() ? 'Opponent connected. Start when you are ready.' : 'Waiting for an opponent to join…', net.isConnected() ? 'ok' : '');
  $('startBtn').disabled = !net.isConnected();
  show('menu');
}

/* ---------- Guest ---------- */
function openJoin() {
  session.mode = 'local';
  setStatus('joinStatus', '');
  $('joinBtn').disabled = false;
  show('join');
}
function joinRoom() {
  var code = net.normalizeCode($('joinCode').value);
  $('joinCode').value = code;
  if (!net.isValidCode(code)) {
    setStatus('joinStatus', 'Room codes have 6 characters (consonants and digits 2–9), like K7M2PQ.', 'error');
    return;
  }
  ac();
  session.mode = 'guest'; session.frozen = false;
  setPerspective(net.GUEST_TEAM);
  inMatch = false; roomCode = code;
  $('joinBtn').disabled = true;
  setStatus('joinStatus', 'Connecting to room ' + code + '…');
  setNet('connecting');
  net.joinRoom(code, {
    onConnected: function () {
      setNet('connected');
      showGuestWait();
    },
    onInit: function (msg) {
      var cfg = { names: msg.names, hp: msg.hp, style: msg.style, seed: msg.seed };
      clearFx();
      setupBattle(cfg);
      lastCfg = cfg;
      enterBattle();
      net.sendReady();
    },
    onOver: function () { if (G.phase === 'over' && $('over').hidden) showGameOver(); },
    onWait: function () {
      inMatch = false;
      resetToMenu(); clearFx();
      showGuestWait();
    },
    onLost: function () { interrupted('The connection to the host was lost.'); },
    onError: function (msg) {
      session.mode = 'local';
      setNet('disconnected');
      setStatus('joinStatus', msg, 'error');
      $('joinBtn').disabled = false;
      show('join');
    }
  });
}
function showGuestWait() {
  $('guestWaitText').textContent = 'You are in room ' + roomCode + ' and will play as the blue team. The host is choosing the map and team names.';
  show('guestWait');
}

/* ---------- Both online roles ---------- */
function interrupted(text) {
  session.frozen = true;
  inMatch = false; pendingCfg = null;
  setNet('disconnected');
  $('netLostText').textContent = text + ' The match has been stopped.';
  show('netLost');
}
function leaveOnline() {
  net.leave();
  session.mode = 'local'; session.frozen = false;
  inMatch = false; pendingCfg = null;
  setRecording(false);
  setPerspective(-1);
  resetToMenu(); clearFx();
  setNet(null);
  show('start');
}

/* ---------- Game over ---------- */
export function showGameOver() {
  var win = G.winner, teams = S.teams, box = $('overBox');
  inMatch = false;
  box.className = 'box' + (win >= 0 ? ' win' + win : '');
  $('overTitle').textContent = win < 0 ? 'Draw' : (teams[win].name + ' wins');
  $('overText').textContent = win < 0 ? 'Both teams fell at the same time.' : 'Every enemy soldier has been eliminated.';
  var rows = '<tr><th>Team</th><th>Kills</th><th>Damage</th><th>Shots</th></tr>';
  teams.forEach(function (T, i) {
    rows += '<tr><td><span class="mark c' + i + '"></span>' + esc(T.name) + '</td><td>' + T.stat.kills + '</td><td>' + T.stat.dmg + '</td><td>' + T.stat.shots + '</td></tr>';
  });
  $('overStats').innerHTML = rows;
  var mode = session.mode;
  $('rematch').hidden = mode === 'guest';
  $('rematch').disabled = false;
  $('toMenu').textContent = mode === 'local' ? 'Change teams' : (mode === 'host' ? 'Back to room settings' : 'Leave room');
  setStatus('overStatus', mode === 'guest' ? 'Waiting for the host to start a rematch…' : '');
  show('over');
}

export function setupMenu() {
  $('btnLocal').addEventListener('click', function () { ac(); openLocalSetup(); });
  $('btnHost').addEventListener('click', function () { ac(); openHostRoom(); });
  $('btnJoin').addEventListener('click', openJoin);

  $('setup').addEventListener('submit', function (e) {
    e.preventDefault(); ac();
    if (session.mode === 'host') requestHostBattle(readCfg());
    else beginLocal(readCfg());
  });
  $('setupBack').addEventListener('click', function () {
    if (session.mode === 'host') leaveOnline(); else show('start');
  });
  $('copyCode').addEventListener('click', function () {
    var btn = this;
    function done(ok) { btn.textContent = ok ? 'Copied' : 'Copy failed'; setTimeout(function () { btn.textContent = 'Copy'; }, 1500); }
    try { navigator.clipboard.writeText(roomCode).then(function () { done(true); }, function () { done(false); }); }
    catch (e) { done(false); }
  });

  $('joinForm').addEventListener('submit', function (e) { e.preventDefault(); joinRoom(); });
  $('joinBack').addEventListener('click', function () { net.leave(); setNet(null); session.mode = 'local'; show('start'); });
  $('guestLeave').addEventListener('click', leaveOnline);
  $('netLostBack').addEventListener('click', leaveOnline);

  $('rematch').addEventListener('click', function () {
    if (session.mode === 'host') requestHostBattle(lastCfg || readCfg());
    else beginLocal(lastCfg || readCfg());
  });
  $('toMenu').addEventListener('click', function () {
    if (session.mode === 'host') hostBackToRoom();
    else if (session.mode === 'guest') leaveOnline();
    else { resetToMenu(); clearFx(); openLocalSetup(); }
  });
  $('sound').addEventListener('click', function () {
    setSoundOn(!isSoundOn());
    this.setAttribute('aria-pressed', String(isSoundOn()));
    this.textContent = isSoundOn() ? 'Sound on' : 'Sound off';
  });
  window.addEventListener('beforeunload', function () { net.leave(); });
}
