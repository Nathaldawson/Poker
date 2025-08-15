/*
  Heads-up Texas Hold'em - Minimal Casino-Style
  - Single player vs dealer AI
  - Correct betting flow with blinds and per-street contributions
  - Hand evaluator for 7-card best hand
*/

// Utility: DOM helpers
function $(id) { return document.getElementById(id); }

// Game constants
const SMALL_BLIND = 5;
const BIG_BLIND = 10;
const STARTING_STACK = 1000;
const MAX_RAISES_PER_STREET = 3;

// Card utilities
const RANKS = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
const SUITS = ["♠","♥","♦","♣"]; // S,H,D,C
const RANK_TO_VALUE = Object.fromEntries(RANKS.map((r, i) => [r, i + 2]));

function rankToDisplay(r) { return r === 'T' ? '10' : r; }

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit, value: RANK_TO_VALUE[rank] });
    }
  }
  return deck;
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Rendering cards
function renderCard(card, options = {}) {
  const faceDown = options.faceDown === true;
  const div = document.createElement('div');
  div.className = faceDown ? 'card back' : `card ${card && (card.suit === '♥' || card.suit === '♦') ? 'red' : ''}`;
  if (!faceDown) {
    const label = rankToDisplay(card.rank);
    div.innerHTML = `
      <div class="inner">
        <div class="corner">${label}${card.suit}</div>
        <div class="pip">${card.suit}</div>
        <div class="corner bottom">${label}${card.suit}</div>
      </div>
    `;
  } else {
    // Fallback in case CSS hasn't applied yet
    div.style.background = "center / contain no-repeat url('cover.png')";
  }
  return div;
}

function clearChildren(node) { while (node.firstChild) node.removeChild(node.firstChild); }

// Hand evaluation
function evaluateBestOfSeven(sevenCards) {
  let best = null;
  // choose 5 of 7 (21 combos)
  for (let a = 0; a < 7; a++) {
    for (let b = a + 1; b < 7; b++) {
      const five = [];
      for (let i = 0; i < 7; i++) if (i !== a && i !== b) five.push(sevenCards[i]);
      const score = scoreFiveCardHand(five);
      if (best === null || compareScores(score, best) > 0) best = score;
    }
  }
  return best;
}

function compareScores(a, b) {
  // lexicographic compare: [category, k1, k2, k3, k4, k5]
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

function scoreFiveCardHand(cards) {
  const valuesDesc = cards.map(c => c.value).sort((x, y) => y - x);
  const suits = cards.map(c => c.suit);

  // counts
  const valueCounts = new Map();
  for (const v of valuesDesc) valueCounts.set(v, (valueCounts.get(v) || 0) + 1);
  const counts = [...valueCounts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0] - a[0];
  });

  // Flush detection and flush values
  const suitCounts = new Map();
  for (const s of suits) suitCounts.set(s, (suitCounts.get(s) || 0) + 1);
  const flushSuit = [...suitCounts.entries()].find(([, n]) => n === 5)?.[0] || null;
  const isFlush = !!flushSuit;
  const flushValuesDesc = isFlush ? cards.filter(c => c.suit === flushSuit).map(c => c.value).sort((a,b)=>b-a) : [];

  // Straight detection helper
  function highestStraight(values) {
    const uniq = [...new Set(values)].sort((a,b)=>b-a);
    // normal straights
    for (let i = 0; i <= uniq.length - 5; i++) {
      const window = uniq.slice(i, i + 5);
      if (window[0] - window[4] === 4) return window[0];
    }
    // wheel A2345
    if (uniq.includes(14) && [5,4,3,2].every(v => uniq.includes(v))) return 5;
    return null;
  }

  const straightHigh = highestStraight(valuesDesc);
  const straightFlushHigh = isFlush ? highestStraight(flushValuesDesc) : null;

  if (straightFlushHigh) {
    return [9, straightFlushHigh, 0, 0, 0, 0]; // Straight flush
  }

  if (counts[0][1] === 4) {
    // Four of a kind: quad value, kicker
    const quad = counts[0][0];
    const kicker = counts.find(c => c[0] !== quad)[0];
    return [8, quad, kicker, 0, 0, 0];
  }

  if (counts[0][1] === 3 && counts[1][1] === 2) {
    // Full house: trips value, pair value
    return [7, counts[0][0], counts[1][0], 0, 0, 0];
  }

  if (isFlush) {
    return [6, ...flushValuesDesc, 0];
  }

  if (straightHigh) {
    return [5, straightHigh, 0, 0, 0, 0];
  }

  if (counts[0][1] === 3) {
    // Trips + kickers
    const trips = counts[0][0];
    const kickers = counts.filter(([v,c]) => c === 1 && v !== trips).map(([v]) => v).sort((a,b)=>b-a).slice(0,2);
    return [4, trips, ...kickers, 0];
  }

  if (counts[0][1] === 2 && counts[1][1] === 2) {
    // Two pair: top pair, second pair, kicker
    const pairVals = counts.filter(([,c]) => c === 2).map(([v]) => v).sort((a,b)=>b-a);
    const kicker = counts.filter(([,c]) => c === 1).map(([v]) => v).sort((a,b)=>b-a)[0];
    return [3, pairVals[0], pairVals[1], kicker, 0, 0];
  }

  if (counts[0][1] === 2) {
    // One pair + 3 kickers
    const pair = counts[0][0];
    const kickers = counts.filter(([,c]) => c === 1).map(([v]) => v).sort((a,b)=>b-a).slice(0,3);
    return [2, pair, ...kickers];
  }

  return [1, ...valuesDesc]; // High card
}

function describeScore(score) {
  const category = score[0];
  switch (category) {
    case 9: return `Straight Flush (${valueToLabel(score[1])} high)`;
    case 8: return `Four of a Kind (${valueToLabel(score[1])}s)`;
    case 7: return `Full House (${valueToLabel(score[1])}s over ${valueToLabel(score[2])}s)`;
    case 6: return `Flush`;
    case 5: return `Straight (${valueToLabel(score[1])} high)`;
    case 4: return `Three of a Kind (${valueToLabel(score[1])}s)`;
    case 3: return `Two Pair (${valueToLabel(score[1])}s and ${valueToLabel(score[2])}s)`;
    case 2: return `One Pair (${valueToLabel(score[1])}s)`;
    case 1: return `High Card (${valueToLabel(score[1])})`;
    default: return `Hand`;
  }
}

function valueToLabel(v) {
  const inv = Object.fromEntries(Object.entries(RANK_TO_VALUE).map(([k,v]) => [v, k]));
  return inv[v].replace('T','10');
}

// Game state
const state = {
  deck: [],
  playerCards: [],
  opponentCards: [],
  community: [],
  pot: 0,
  street: 'preflop', // preflop, flop, turn, river, showdown
  playerStack: STARTING_STACK,
  opponentStack: STARTING_STACK,
  dealerButton: 'player', // 'player' or 'opponent'
  toAct: 'player',
  handOver: false,
  // betting per street
  streetBets: { player: 0, opponent: 0 },
  betToMatch: 0, // current total bet to match on this street
  lastBetSize: BIG_BLIND, // last increment size for min-raise rule
  raisesThisStreet: 0,
  acted: { player: false, opponent: false },
};

// UI bindings
const el = {
  playerStackTop: $('playerStack'),
  playerStackBottom: $('playerStackBottom'),
  opponentStack: $('opponentStack'),
  pot: $('pot'),
  blinds: $('blinds'),
  handInfo: $('handInfo'),
  playerCards: $('playerCards'),
  opponentCards: $('opponentCards'),
  community: $('community'),
  status: $('status'),
  playerAction: $('playerAction'),
  opponentAction: $('opponentAction'),
  betSlider: $('betSlider'),
  betAmount: $('betAmount'),
  btnFold: $('btnFold'),
  btnCheckCall: $('btnCheckCall'),
  btnBetRaise: $('btnBetRaise'),
  toast: $('toast'),
  overlay: $('overlay'),
  dialogTitle: $('dialogTitle'),
  dialogBody: $('dialogBody'),
  btnNextHand: $('btnNextHand'),
  fxConfetti: $('fxConfetti'),
  fxChips: $('fxChips')
};

function clearFx() {
  document.querySelectorAll('.seat').forEach(s => s.classList.remove('win'));
  document.querySelectorAll('.winner-tag').forEach(n => n.remove());
  el.fxConfetti.innerHTML = '';
  el.fxChips.innerHTML = '';
  document.querySelector('.table-surface')?.classList.remove('win-glow');
}

function showWinnerFx(winner) {
  const seatSelector = winner === 'player' ? '.player.seat' : '.opponent.seat';
  const seat = document.querySelector(seatSelector);
  if (!seat) return;
  seat.classList.add('win');

  // Winner tag
  const tag = document.createElement('div');
  tag.className = 'winner-tag';
  tag.innerHTML = `<span class="trophy">🏆</span> Winner`;
  seat.appendChild(tag);

  // Table glow
  document.querySelector('.table-surface')?.classList.add('win-glow');

  // Confetti
  spawnConfetti(60);

  // Chips burst
  spawnChipBurst(16);
}

function spawnConfetti(count) {
  const colors = ['#fbbf24','#34d399','#60a5fa','#f472b6','#f87171'];
  const durBase = 1200;
  el.fxConfetti.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti';
    piece.style.left = Math.random()*100 + '%';
    piece.style.top = '-10px';
    piece.style.background = colors[Math.floor(Math.random()*colors.length)];
    const delay = Math.random()*0.3;
    const dur = durBase + Math.random()*1000;
    piece.style.animationDuration = dur + 'ms';
    piece.style.animationDelay = (delay*1000) + 'ms';
    el.fxConfetti.appendChild(piece);
  }
  // Cleanup later
  setTimeout(() => { el.fxConfetti.innerHTML = ''; }, 2500);
}

function spawnChipBurst(count) {
  el.fxChips.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const chip = document.createElement('div');
    chip.className = 'chip-burst';
    const angle = (Math.PI*2) * (i / count);
    const radius = 60 + Math.random()*40;
    chip.style.setProperty('--dx', Math.cos(angle)*radius + 'px');
    chip.style.setProperty('--dy', Math.sin(angle)*radius + 'px');
    el.fxChips.appendChild(chip);
  }
  setTimeout(() => { el.fxChips.innerHTML = ''; }, 800);
}

// Difficulty state
let difficulty = 'normal';
let aiTimeoutId = null;
let forceDealerButton = null; // when set, next startHand uses this and does not rotate

function scheduleAi(delayMs) {
  cancelAi();
  aiTimeoutId = setTimeout(aiAct, delayMs);
}
function cancelAi() {
  if (aiTimeoutId !== null) {
    clearTimeout(aiTimeoutId);
    aiTimeoutId = null;
  }
}

function init() {
  el.blinds.textContent = `${SMALL_BLIND} / ${BIG_BLIND}`;
  bindControls();
  startHand();
}

function bindControls() {
  el.betSlider.addEventListener('input', () => {
    updateBetAmountLabel();
  });
  // Mouse wheel to adjust bet size on slider and bet area
  const betArea = document.querySelector('.bet-sizing');
  const onBetWheel = (e) => {
    // Only allow during player's turn and when not hand over
    if (state.toAct !== 'player' || state.handOver) return;
    e.preventDefault();
    const stepAttr = parseInt(el.betSlider.getAttribute('step') || '5', 10);
    let step = isNaN(stepAttr) ? 5 : stepAttr;
    if (e.shiftKey) step *= 5; // faster with Shift
    if (e.altKey) step = Math.max(1, Math.floor(step / 5)); // finer with Alt

    const min = Number(el.betSlider.min || 0);
    const max = Number(el.betSlider.max || 0);
    let val = Number(el.betSlider.value || min);

    const direction = Math.sign(e.deltaY); // >0 down; <0 up
    if (direction > 0) val = Math.max(min, val - step);
    else if (direction < 0) val = Math.min(max, val + step);

    el.betSlider.value = String(val);
    updateBetAmountLabel();
  };
  if (betArea) betArea.addEventListener('wheel', onBetWheel, { passive: false });
  el.betSlider.addEventListener('wheel', onBetWheel, { passive: false });

  // Removed quick bet buttons
  el.btnFold.addEventListener('click', () => onPlayerClick('fold'));
  el.btnCheckCall.addEventListener('click', () => onPlayerClick(amountToCall('player') > 0 ? 'call' : 'check'));
  el.btnBetRaise.addEventListener('click', () => onPlayerClick(betToMatch() > 0 ? 'raise' : 'bet'));
  el.btnNextHand.addEventListener('click', () => {
    el.overlay.hidden = true;
    startHand();
  });
  // Header controls
  const diff = document.getElementById('difficulty');
  if (diff) diff.addEventListener('change', () => { difficulty = diff.value; toast(`Difficulty: ${difficulty}`); });
  const btnReset = document.getElementById('btnReset');
  if (btnReset) btnReset.addEventListener('click', () => resetGame());

  // Allow click outside dialog to dismiss overlay
  el.overlay.addEventListener('click', (e) => {
    if (e.target === el.overlay) {
      el.overlay.hidden = true;
    }
  });
  // Escape to close overlay
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !el.overlay.hidden) {
      el.overlay.hidden = true;
    }
  });
}

function updateBetAmountLabel() {
  const max = Number(el.betSlider.max || '0');
  const val = Number(el.betSlider.value || '0');
  if (state.playerStack > 0 && val >= max && max > 0) {
    el.betAmount.textContent = 'All-in';
  } else {
    el.betAmount.textContent = String(val);
  }
}

let isResetting = false;

function resetGame() {
  if (isResetting) return;
  isResetting = true;
  try {
    // Close overlays and stop any timers/animations
    el.overlay.hidden = true;
    cancelAi();
    clearFx();

    // Clear table UI remnants
    el.playerAction.innerHTML = '';
    el.opponentAction.innerHTML = '';
    clearChildren(el.playerCards);
    clearChildren(el.opponentCards);
    clearChildren(el.community);

    // Reset stacks and full engine state
    state.playerStack = STARTING_STACK;
    state.opponentStack = STARTING_STACK;
    state.pot = 0;
    state.street = 'preflop';
    state.handOver = false;
    state.streetBets = { player: 0, opponent: 0 };
    state.betToMatch = 0;
    state.lastBetSize = BIG_BLIND;
    state.raisesThisStreet = 0;
    state.acted = { player: false, opponent: false };

    // Force a consistent first button position after reset
    forceDealerButton = 'opponent';

    // Reset slider to sensible default
    el.betSlider.min = String(BIG_BLIND);
    el.betSlider.max = String(STARTING_STACK);
    el.betSlider.value = String(BIG_BLIND);
    updateBetAmountLabel();

    // Start fresh hand
    startHand();
  } finally {
    isResetting = false;
  }
}

function getPotAfterCall() {
  const toCall = amountToCall(state.toAct);
  return state.pot + Math.min(toCall, stackOf(state.toAct));
}

function stackOf(who) { return who === 'player' ? state.playerStack : state.opponentStack; }

function clampNewBetTotal(who, desiredTotal) {
  // new total contribution this street capped by stack
  const maxTotal = state.streetBets[who] + stackOf(who);
  return Math.max(0, Math.min(desiredTotal, maxTotal));
}

// Start a new hand
function startHand() {
  // Ensure overlay is closed and FX are cleared before dealing
  el.overlay.hidden = true;
  cancelAi();
  clearFx();
  Object.assign(state, {
    deck: shuffle(createDeck()),
    playerCards: [],
    opponentCards: [],
    community: [],
    pot: 0,
    street: 'preflop',
    handOver: false,
    streetBets: { player: 0, opponent: 0 },
    betToMatch: 0,
    lastBetSize: BIG_BLIND,
    raisesThisStreet: 0,
    acted: { player: false, opponent: false },
  });

  // Dealer button: honor forced position on hard reset; otherwise rotate
  if (forceDealerButton) {
    state.dealerButton = forceDealerButton;
    forceDealerButton = null;
  } else {
    state.dealerButton = state.dealerButton === 'player' ? 'opponent' : 'player';
  }

  // Blinds
  postBlinds();

  // Deal hole cards
  state.playerCards.push(state.deck.pop(), state.deck.pop());
  state.opponentCards.push(state.deck.pop(), state.deck.pop());

  // Action order: heads-up preflop - small blind (button) acts first
  state.toAct = state.dealerButton; // dealer is SB heads-up

  render();
  if (state.toAct === 'opponent') scheduleAi(600);
}

function postBlinds() {
  const sbPlayer = state.dealerButton; // heads-up dealer posts SB
  const bbPlayer = other(sbPlayer);
  const sbPaid = takeFromStack(sbPlayer, SMALL_BLIND);
  const bbPaid = takeFromStack(bbPlayer, BIG_BLIND);
  state.pot += sbPaid + bbPaid;
  state.streetBets[sbPlayer] = sbPaid;
  state.streetBets[bbPlayer] = bbPaid;
  state.betToMatch = BIG_BLIND;
  state.lastBetSize = BIG_BLIND; // baseline for min-raise preflop
  state.raisesThisStreet = 0;
  state.acted = { player: false, opponent: false };
}

function other(who) { return who === 'player' ? 'opponent' : 'player'; }

function takeFromStack(who, amount) {
  const amt = Math.min(amount, stackOf(who));
  if (who === 'player') state.playerStack -= amt; else state.opponentStack -= amt;
  return amt;
}

function addToPot(amount) { state.pot += amount; }

function amountToCall(who) {
  return Math.max(0, state.betToMatch - state.streetBets[who]);
}

function betToMatch() { return state.betToMatch; }

function minRaiseNewTotal() {
  if (state.betToMatch === 0) return Math.max(BIG_BLIND, state.lastBetSize);
  return state.betToMatch + Math.max(BIG_BLIND, state.lastBetSize);
}

function render() {
  // Stacks and pot
  el.playerStackTop.textContent = state.playerStack;
  el.playerStackBottom.textContent = state.playerStack;
  el.opponentStack.textContent = state.opponentStack;
  el.pot.textContent = state.pot;
  el.handInfo.textContent = state.street.charAt(0).toUpperCase() + state.street.slice(1);

  // Cards
  clearChildren(el.playerCards);
  clearChildren(el.opponentCards);
  clearChildren(el.community);

  state.playerCards.forEach(c => el.playerCards.appendChild(renderCard(c)));

  const oppFaceDown = !(state.street === 'showdown' || state.handOver);
  state.opponentCards.forEach(c => el.opponentCards.appendChild(renderCard(c, { faceDown: oppFaceDown })));

  state.community.forEach(c => el.community.appendChild(renderCard(c)));

  // Status and buttons
  const toCallPlayer = amountToCall('player');
  el.btnCheckCall.textContent = toCallPlayer > 0 ? `Call ${Math.min(toCallPlayer, state.playerStack)}` : 'Check';
  el.btnBetRaise.textContent = betToMatch() > 0 ? 'Raise' : 'Bet';
  el.status.textContent = state.handOver ? 'Hand over' : state.toAct === 'player' ? 'Your move' : 'Waiting for dealer';

  // Slider bounds show how much more to put in, not total
  const maxAdd = state.playerStack; // maximum additional chips available
  let minAdd = betToMatch() === 0 ? BIG_BLIND : Math.max(0, minRaiseNewTotal() - state.streetBets.player);
  minAdd = Math.min(minAdd, maxAdd);
  el.betSlider.min = String(minAdd);
  el.betSlider.max = String(maxAdd);
  el.betSlider.step = String(Math.max(1, Math.min(5, BIG_BLIND)));
  if (+el.betSlider.value < +el.betSlider.min) el.betSlider.value = el.betSlider.min;
  if (+el.betSlider.value > +el.betSlider.max) el.betSlider.value = el.betSlider.max;
  updateBetAmountLabel();

  // Controls enablement: only disable in the main controls area
  const playerTurn = state.toAct === 'player' && !state.handOver;
  document.querySelectorAll('.controls button, .controls input[type="range"]').forEach(elm => {
    if (elm.closest('.dialog')) return;
    elm.disabled = !playerTurn;
  });

  // Action cue text cleared
  el.playerAction.innerHTML = '';
  el.opponentAction.innerHTML = '';
}

function onPlayerClick(action) {
  if (state.toAct !== 'player' || state.handOver) return;
  handleAction('player', action, parseInt(el.betSlider.value || '0', 10));
}

function handleAction(who, action, sliderAddAmount = 0) {
  if (state.handOver) return;

  const opponent = other(who);

  if (action === 'fold') {
    emitAction(who, 'Folds');
    endHand(other(who));
    return;
  }

  if (action === 'check') {
    if (amountToCall(who) > 0) return; // cannot check facing a bet
    emitAction(who, 'Checks');
    state.acted[who] = true;
    advanceRound(who);
    return;
  }

  if (action === 'call') {
    const toCall = Math.min(amountToCall(who), stackOf(who));
    const paid = takeFromStack(who, toCall);
    addToPot(paid);
    state.streetBets[who] += paid;
    emitAction(who, `Calls ${paid}`);
    state.acted[who] = true;
    
    if (isAllIn()) {
      render();
      runOutBoard();
      return;
    }

    advanceRound(who);
    return;
  }

  if (action === 'bet' || action === 'raise') {
    const currentTotal = state.streetBets[who];
    const maxAddAvail = stackOf(who);
    const desiredAddRaw = parseInt(String(sliderAddAmount), 10);
    const desiredAdd = isNaN(desiredAddRaw) ? 0 : Math.max(0, Math.min(desiredAddRaw, maxAddAvail));
    let newTotal = currentTotal + desiredAdd; // new total on street

    // Enforce min bet / min raise to new total
    if (state.betToMatch === 0) {
      // opening bet must be >= BIG_BLIND
      if (newTotal < BIG_BLIND && newTotal !== currentTotal + stackOf(who)) {
        toast(`Minimum bet is ${BIG_BLIND}`);
        return;
      }
    } else {
      // raise must be at least lastBetSize
      const minNewTotal = state.betToMatch + Math.max(BIG_BLIND, state.lastBetSize);
      if (newTotal < minNewTotal && newTotal !== currentTotal + stackOf(who)) {
        toast(`Minimum raise to ${minNewTotal}`);
        return;
      }
    }

    // Pay delta
    const delta = Math.max(0, newTotal - currentTotal);
    const paid = takeFromStack(who, delta);
    addToPot(paid);
    state.streetBets[who] += paid;

    // Update bet to match and last bet size
    const prevToMatch = state.betToMatch;
    state.betToMatch = state.streetBets[who];
    state.lastBetSize = Math.max(BIG_BLIND, state.betToMatch - prevToMatch);
    state.raisesThisStreet += 1;

    emitAction(who, `${prevToMatch === 0 ? 'Bets' : 'Raises'} ${paid}`);

    // After a bet/raise, the bettor has acted, the other must respond
    state.acted[who] = true;
    state.acted[opponent] = false;
    state.toAct = opponent;
    render();
    if (who === 'player') scheduleAi(600);
    return;
  }
}

function emitAction(who, text) {
  const target = who === 'player' ? el.playerAction : el.opponentAction;
  target.innerHTML = `<span class="cue">${text}</span>`;
}

// Helper: all-in detection
function isAllIn() { return state.playerStack === 0 || state.opponentStack === 0; }

function runOutBoard() {
  // Deal remaining community cards without further betting and go to showdown
  while (state.street !== 'river' && state.street !== 'showdown') {
    if (state.street === 'preflop') {
      state.deck.pop();
      state.community.push(state.deck.pop(), state.deck.pop(), state.deck.pop());
      state.street = 'flop';
    } else if (state.street === 'flop') {
      state.deck.pop();
      state.community.push(state.deck.pop());
      state.street = 'turn';
    } else if (state.street === 'turn') {
      state.deck.pop();
      state.community.push(state.deck.pop());
      state.street = 'river';
      break;
    }
  }
  render();
  if (state.street === 'river') {
    // proceed directly to showdown
    state.street = 'showdown';
    showdown();
  }
}

// Update advanceRound to account for all-in
function advanceRound(actor) {
  const otherActor = other(actor);
  const bothActed = state.acted.player && state.acted.opponent;
  const outstanding = amountToCall('player') + amountToCall('opponent');

  // If someone is all-in, auto run out the board (no more betting possible)
  if (isAllIn()) {
    runOutBoard();
    return;
  }

  if (bothActed && outstanding === 0) {
    nextStreet();
    return;
  }

  state.toAct = otherActor;
  render();
  if (state.toAct === 'opponent') scheduleAi(600);
}

function nextStreet() {
  state.raisesThisStreet = 0;
  state.acted = { player: false, opponent: false };
  state.streetBets = { player: 0, opponent: 0 };
  state.betToMatch = 0;
  state.lastBetSize = BIG_BLIND;

  if (state.street === 'preflop') {
    // Flop: burn one, deal three
    state.deck.pop();
    state.community.push(state.deck.pop(), state.deck.pop(), state.deck.pop());
    state.street = 'flop';
    state.toAct = other(state.dealerButton); // postflop: non-button acts first heads-up
  } else if (state.street === 'flop') {
    state.deck.pop();
    state.community.push(state.deck.pop());
    state.street = 'turn';
    state.toAct = other(state.dealerButton);
  } else if (state.street === 'turn') {
    state.deck.pop();
    state.community.push(state.deck.pop());
    state.street = 'river';
    state.toAct = other(state.dealerButton);
  } else if (state.street === 'river') {
    state.street = 'showdown';
    showdown();
    return;
  }
  render();
  if (state.toAct === 'opponent') scheduleAi(600);
}

function showdown() {
  const playerSeven = [...state.playerCards, ...state.community];
  const oppSeven = [...state.opponentCards, ...state.community];
  const playerScore = evaluateBestOfSeven(playerSeven);
  const oppScore = evaluateBestOfSeven(oppSeven);
  const cmp = compareScores(playerScore, oppScore);

  let title, body, winner;
  if (cmp > 0) {
    title = 'You win';
    body = `${describeScore(playerScore)} beats ${describeScore(oppScore)}.`;
    state.playerStack += state.pot;
    winner = 'player';
  } else if (cmp < 0) {
    title = 'Dealer wins';
    body = `${describeScore(oppScore)} beats ${describeScore(playerScore)}.`;
    state.opponentStack += state.pot;
    winner = 'opponent';
  } else {
    title = 'Split pot';
    body = `${describeScore(playerScore)} ties ${describeScore(oppScore)}.`;
    const half = Math.floor(state.pot / 2);
    state.playerStack += half;
    state.opponentStack += state.pot - half;
    winner = null;
  }
  state.pot = 0;
  state.handOver = true;
  state.street = 'showdown';
  render();
  cancelAi();
  if (winner) showWinnerFx(winner);
  openDialog(title, body);
}

function endHand(winner) {
  const title = winner === 'player' ? 'You win' : 'Dealer wins';
  const body = winner === 'player' ? 'Dealer folded.' : 'You folded.';
  if (winner === 'player') state.playerStack += state.pot; else state.opponentStack += state.pot;
  state.pot = 0;
  state.handOver = true;
  state.street = 'showdown';
  render();
  cancelAi();
  showWinnerFx(winner);
  openDialog(title, body);
}

function openDialog(title, body) {
  el.dialogTitle.textContent = title;
  el.dialogBody.textContent = body;
  el.overlay.hidden = false;
  cancelAi();
  // focus the action button for immediate keyboard/enter interaction
  setTimeout(() => el.btnNextHand?.focus(), 0);
}

function toast(text) {
  el.toast.textContent = text;
  el.toast.classList.add('show');
  setTimeout(() => el.toast.classList.remove('show'), 1600);
}

// Simple opponent AI
function aiAct() {
  if (state.handOver || state.toAct !== 'opponent') return;

  const toCall = amountToCall('opponent');
  const strength = estimateStrength([...state.opponentCards, ...state.community], state.street);

  // Adjust thresholds by difficulty
  const cfg = getDifficultyConfig();
  let action = 'check';
  let newTotal = state.streetBets.opponent; // total on street after action

  if (toCall > 0) {
    if (strength < cfg.foldThresholdFacingBigBet && toCall > BIG_BLIND * 6) {
      action = 'fold';
    } else if (strength > cfg.aggressiveThreshold && state.raisesThisStreet < MAX_RAISES_PER_STREET) {
      action = 'raise';
      const prevToMatch = state.betToMatch;
      const raiseTo = chooseRaiseTotal(strength) * cfg.raiseMultiplier;
      newTotal = Math.max(prevToMatch + Math.max(BIG_BLIND, state.lastBetSize), clampNewBetTotal('opponent', Math.floor(raiseTo)));
    } else {
      action = 'call';
    }
  } else {
    if (strength > cfg.aggressiveThreshold && state.raisesThisStreet < MAX_RAISES_PER_STREET) {
      action = 'bet';
      const openTo = chooseRaiseTotal(strength) * cfg.raiseOpenMultiplier;
      newTotal = Math.max(BIG_BLIND, clampNewBetTotal('opponent', Math.floor(openTo)));
    } else {
      action = 'check';
    }
  }

  if (action === 'fold') {
    emitAction('opponent', 'Folds');
    endHand('player');
    return;
  }

  if (action === 'check') {
    emitAction('opponent', 'Checks');
    state.acted.opponent = true;
    advanceRound('opponent');
    return;
  }

  if (action === 'call') {
    const paid = takeFromStack('opponent', Math.min(toCall, state.opponentStack));
    addToPot(paid);
    state.streetBets.opponent += paid;
    emitAction('opponent', `Calls ${paid}`);
    state.acted.opponent = true;

    if (isAllIn()) {
      render();
      runOutBoard();
      return;
    }

    advanceRound('opponent');
    return;
  }

  if (action === 'bet' || action === 'raise') {
    const currentTotal = state.streetBets.opponent;
    const delta = Math.max(0, newTotal - currentTotal);
    const paid = takeFromStack('opponent', delta);
    addToPot(paid);
    state.streetBets.opponent += paid;

    const prevToMatch = state.betToMatch;
    state.betToMatch = state.streetBets.opponent;
    state.lastBetSize = Math.max(BIG_BLIND, state.betToMatch - prevToMatch);
    state.raisesThisStreet += 1;

    emitAction('opponent', `${action === 'bet' ? 'Bets' : 'Raises'} ${paid}`);

    state.acted.opponent = true;
    state.acted.player = false;
    state.toAct = 'player';
    render();
    return;
  }
}

function chooseRaiseTotal(strength) {
  const pot = getPotAfterCall();
  // size between 0.5x and 1.2x pot depending on strength, capped by stack in clamp
  const factor = 0.5 + 0.7 * Math.max(0, Math.min(1, strength - 0.5));
  return Math.floor(pot * factor) + state.betToMatch; // raise on top of call baseline
}

function estimateStrength(cardsKnown, street) {
  // crude heuristic: use exact 5/7-card strength if board is present, otherwise preflop matrix
  if (street === 'preflop') {
    const [a, b] = state.opponentCards;
    return preflopHeuristic(a, b);
  }
  const sevenFilled = [...cardsKnown];
  while (sevenFilled.length < 7) sevenFilled.push({ value: 0, suit: 'x', rank: '?' });
  const score = evaluateBestOfSeven(sevenFilled);
  // map category-based to [0..1]
  const cat = score[0];
  const mapping = { 9: 0.99, 8: 0.97, 7: 0.95, 6: 0.85, 5: 0.8, 4: 0.6, 3: 0.5, 2: 0.35, 1: 0.2 };
  return mapping[cat] || 0.5;
}

function preflopHeuristic(c1, c2) {
  const v1 = c1.value, v2 = c2.value;
  const high = Math.max(v1, v2);
  const low = Math.min(v1, v2);
  const pair = v1 === v2;
  const suited = c1.suit === c2.suit;
  const gap = high - low;

  let score = 0.25;
  if (pair) score = 0.6 + (high - 6) * 0.04; // 22..AA scales up
  else if (high >= 13 && low >= 11) score = 0.55; // broadway combos
  else if (suited && gap <= 2 && high >= 10) score = 0.5; // suited connectors high
  else if (suited && gap <= 3) score = 0.45; // suited gappers
  else if (high >= 13 && low >= 9) score = 0.45;

  score += (suited ? 0.03 : 0) + ((high >= 14) ? 0.02 : 0);
  score = Math.max(0.1, Math.min(0.9, score));
  return score;
}

function getDifficultyConfig() {
  switch (difficulty) {
    case 'easy':
      return { aggressiveThreshold: 0.68, foldThresholdFacingBigBet: 0.28, raiseMultiplier: 0.9, raiseOpenMultiplier: 0.9 };
    case 'hard':
      return { aggressiveThreshold: 0.58, foldThresholdFacingBigBet: 0.20, raiseMultiplier: 1.15, raiseOpenMultiplier: 1.1 };
    default:
      return { aggressiveThreshold: 0.62, foldThresholdFacingBigBet: 0.22, raiseMultiplier: 1.0, raiseOpenMultiplier: 1.0 };
  }
}

// Start
window.addEventListener('DOMContentLoaded', init); 