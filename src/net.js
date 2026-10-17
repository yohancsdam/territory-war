// Online play over WebRTC with PeerJS (public broker, no server of our own).
// Host-authoritative: the host (red) simulates and streams snapshots at 30 Hz; the guest (blue)
// sends its intents at 30 Hz during its turn and draws what it receives.
// This layer only moves messages: game state changes go through applyIntent / applySnapshot,
// everything else is reported to the menu through the handlers passed to hostRoom / joinRoom.
//
// Messages
//   host → guest:  init {seed, style, names, hp} · snapshot · over {winner, stats}
//                  wait (host went back to the room settings) · full (room taken) · ping
//   guest → host:  ready · input {intent} · ping
import { Peer } from 'peerjs';
import { G, S, serializeSnapshot, applySnapshot } from './state.js';
import { applyIntent } from './sim.js';

export const HOST_TEAM = 0;
export const GUEST_TEAM = 1;

const PREFIX = 'tw-';
const CODE_CHARS = 'BCDFGHJKLMNPQRSTVWXZ23456789'; // no vowels, so codes never spell words
const SEND_INTERVAL = 1000 / 30;
const PING_INTERVAL = 1000;
const SILENCE_TIMEOUT = 8000;     // no message for this long = connection lost
const CONNECT_TIMEOUT = 15000;
const PEER_OPTIONS = { debug: 0 };

var peer = null, conn = null, role = null, handlers = {};
var lastRecv = 0, lastPing = 0, lastSnap = 0, lastIntent = 0;
var streaming = false, guestReady = false, connectTimer = null;

export function makeCode() {
  var s = '';
  for (var i = 0; i < 6; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}
export function normalizeCode(s) {
  s = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length === 8 && s.indexOf('TW') === 0) s = s.slice(2);
  return s;
}
export function isValidCode(s) {
  if (s.length !== 6) return false;
  for (var i = 0; i < s.length; i++) if (CODE_CHARS.indexOf(s[i]) < 0) return false;
  return true;
}
export function isConnected() { return !!(conn && conn.open); }

function now() { return performance.now(); }
function send(msg) { if (conn && conn.open) { try { conn.send(msg); } catch (e) { } } }

function errorText(err) {
  var t = err && err.type;
  if (t === 'browser-incompatible') return "This browser doesn't support online play (WebRTC).";
  if (t === 'webrtc') return 'The direct connection between the two browsers failed. A firewall or a strict network may be blocking it.';
  if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed' || t === 'disconnected')
    return "Couldn't reach the matchmaking server. Check your internet connection and try again.";
  return 'Connection error' + (t ? ' (' + t + ')' : '') + '. Try again.';
}

function fail(msg) {
  var h = handlers;
  leave();
  if (h.onError) h.onError(msg);
}

function lost() {
  if (!conn) return;
  var c = conn;
  conn = null; streaming = false; guestReady = false;
  try { c.close(); } catch (e) { }
  if (handlers.onLost) handlers.onLost();
}

function wire(c) {
  c.on('open', function () {
    if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
    lastRecv = now(); lastPing = 0;
    if (handlers.onConnected) handlers.onConnected();
  });
  c.on('data', function (msg) {
    if (c !== conn || !msg || typeof msg !== 'object') return;
    lastRecv = now();
    if (role === 'host') onHostMessage(msg); else onGuestMessage(msg);
  });
  c.on('close', function () { if (c === conn) lost(); });
  c.on('error', function () { if (c === conn) lost(); });
}

function onHostMessage(msg) {
  if (msg.type === 'ready') { if (handlers.onReady) handlers.onReady(); }
  else if (msg.type === 'input') {
    // The guest only controls the blue team, and only during its own turn.
    if (streaming && G.t === GUEST_TEAM && G.phase === 'play') applyIntent(msg.intent);
  }
}

function onGuestMessage(msg) {
  if (msg.type === 'init') { guestReady = false; if (handlers.onInit) handlers.onInit(msg); }
  else if (msg.type === 'snapshot') { if (guestReady) applySnapshot(msg); }
  else if (msg.type === 'over') { if (handlers.onOver) handlers.onOver(msg); }
  else if (msg.type === 'wait') { guestReady = false; if (handlers.onWait) handlers.onWait(); }
  else if (msg.type === 'full') fail('That room already has two players.');
}

/* ---------- Host ---------- */
// h: { onRoom(code), onConnected(), onReady(), onLost(), onError(msg), canAccept() }
export function hostRoom(h) {
  leave();
  role = 'host'; handlers = h || {};
  openHostPeer(0);
}
function openHostPeer(attempt) {
  var code = makeCode();
  var p = new Peer(PREFIX + code, PEER_OPTIONS);
  peer = p;
  p.on('open', function () { if (p === peer && handlers.onRoom) handlers.onRoom(code); });
  p.on('connection', function (c) {
    if (p !== peer) return;
    if (conn || (handlers.canAccept && !handlers.canAccept())) {
      c.on('open', function () { try { c.send({ type: 'full' }); } catch (e) { } setTimeout(function () { try { c.close(); } catch (e) { } }, 500); });
      return;
    }
    conn = c;
    wire(c);
  });
  p.on('disconnected', function () {
    // Lost the broker. An open match keeps working; reconnect so new guests can still join.
    if (p === peer && !p.destroyed) { try { p.reconnect(); } catch (e) { } }
  });
  p.on('error', function (err) {
    if (p !== peer) return;
    if (err.type === 'unavailable-id' && attempt < 4 && !conn) { p.destroy(); openHostPeer(attempt + 1); return; }
    if (isConnected()) return; // broker hiccups don't matter once the guest is connected
    fail(errorText(err));
  });
}
export function sendInit(cfg) {
  send({ type: 'init', seed: cfg.seed, style: cfg.style, names: cfg.names, hp: cfg.hp });
}
export function startStreaming() { streaming = true; lastSnap = 0; }
export function sendWait() { streaming = false; send({ type: 'wait' }); }

/* ---------- Guest ---------- */
// h: { onConnected(), onInit(msg), onOver(msg), onWait(), onLost(), onError(msg) }
export function joinRoom(code, h) {
  leave();
  role = 'guest'; handlers = h || {};
  var p = new Peer(PEER_OPTIONS);
  peer = p;
  connectTimer = setTimeout(function () {
    connectTimer = null;
    if (!isConnected()) fail("Couldn't connect to room " + code + '. Check the code, or try again in a moment.');
  }, CONNECT_TIMEOUT);
  p.on('open', function () {
    if (p !== peer) return;
    conn = p.connect(PREFIX + code, { reliable: true, serialization: 'json' });
    wire(conn);
  });
  p.on('error', function (err) {
    if (p !== peer || isConnected()) return;
    fail(err.type === 'peer-unavailable' ? 'No room found with code ' + code + '. Check the code and try again.' : errorText(err));
  });
}
export function sendReady() { guestReady = true; send({ type: 'ready' }); }
// True at most 30 times per second: when the guest should send its accumulated intent.
export function intentDue(t) {
  if (role !== 'guest' || !isConnected() || t - lastIntent < SEND_INTERVAL) return false;
  lastIntent = t;
  return true;
}
export function sendIntent(intent) { send({ type: 'input', intent: intent }); }

/* ---------- Both ---------- */
// Call regularly (every frame, also while the tab is hidden).
export function tick(t) {
  if (!isConnected()) return;
  if (t - lastRecv > SILENCE_TIMEOUT) { lost(); return; }
  if (t - lastPing >= PING_INTERVAL) { lastPing = t; send({ type: 'ping' }); }
  if (role === 'host' && streaming && S.teams && t - lastSnap >= SEND_INTERVAL) {
    lastSnap = t;
    send(serializeSnapshot());
    if (G.phase === 'over') {
      send({ type: 'over', winner: G.winner, stats: S.teams.map(function (T) { return T.stat; }) });
      streaming = false;
    }
  }
}

export function leave() {
  if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
  var c = conn, p = peer;
  conn = null; peer = null; streaming = false; guestReady = false; role = null; handlers = {};
  if (c) { try { c.close(); } catch (e) { } }
  if (p) { try { p.destroy(); } catch (e) { } }
}
