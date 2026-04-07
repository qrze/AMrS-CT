import { ExponentialCost, FirstFreeCost, LinearCost } from "./api/Costs";
import { BigNumber } from "./api/BigNumber";
import { theory } from "./api/Theory";
import { Utils } from "./api/Utils";

var id = "adaptive_multi_regime";
var name = "Adaptive Multi-Regime Stability";
var description =
    "A dynamical system of coupled variables drives currency growth through adaptive logistic mechanics.\n\n" +
    "x (position) chases E (equilibrium) via logistic growth, while E is driven by x raised to a power α. " +
    "S (stability) and D (stress) modulate growth, creating rich multi-regime behaviour.";
var authors = "pwwraisedd, melon";
var version = 9;

requiresGameVersion("1.4.33");

// Internal state tracked in log10-scale to avoid float overflow.
// x = 10^logX, E = 10^logE.
var logX = 0;
var logE = 0;
var S = 1.0;
var D = 0.1;

var currency;
var a1, a2, c1, c2, alpha;
var milestoneResonance, milestoneEquilibriumBoost, milestoneStressFeedback, milestoneExplosion;

const LN10 = Math.log(10);

// ─── Upgrade value helpers ────────────────────────────────────────────────────

var getA1    = (level) => 0.1  + 0.05 * level;
var getA2    = (level) => 0.05 / (1 + level);
var getC1    = (level) => 0.05 + 0.03 * level;
var getAlpha = (level) => 1    + 0.02 * level;
var getBeta  = (level) => Math.pow(1.5, level);

// ─── Init ─────────────────────────────────────────────────────────────────────

var init = () => {
    currency = theory.createCurrency();

    {
        let getDesc = (level) => "a_1=" + getA1(level).toFixed(2);
        let getInfo = (level) => "a_1=" + getA1(level).toFixed(2);
        a1 = theory.createUpgrade(0, currency, new FirstFreeCost(new ExponentialCost(5, 2)));
        a1.getDescription = (_) => Utils.getMath(getDesc(a1.level));
        a1.getInfo = (amount) => Utils.getMathTo(getInfo(a1.level), getInfo(a1.level + amount));
    }

    {
        let getDesc = (level) => "a_2=" + getA2(level).toFixed(3);
        let getInfo = (level) => "a_2=" + getA2(level).toFixed(3);
        a2 = theory.createUpgrade(1, currency, new ExponentialCost(10, 2.2));
        a2.getDescription = (_) => Utils.getMath(getDesc(a2.level));
        a2.getInfo = (amount) => Utils.getMathTo(getInfo(a2.level), getInfo(a2.level + amount));
    }

    {
        let getDesc = (level) => "c_1=" + getC1(level).toFixed(3);
        let getInfo = (level) => "c_1=" + getC1(level).toFixed(3);
        c1 = theory.createUpgrade(2, currency, new ExponentialCost(20, 2.5));
        c1.getDescription = (_) => Utils.getMath(getDesc(c1.level));
        c1.getInfo = (amount) => Utils.getMathTo(getInfo(c1.level), getInfo(c1.level + amount));
    }

    {
        let getDesc = (level) => "\\alpha=" + getAlpha(level).toFixed(2);
        let getInfo = (level) => "\\alpha=" + getAlpha(level).toFixed(2);
        alpha = theory.createUpgrade(3, currency, new ExponentialCost(50, 3));
        alpha.getDescription = (_) => Utils.getMath(getDesc(alpha.level));
        alpha.getInfo = (amount) => Utils.getMathTo(getInfo(alpha.level), getInfo(alpha.level + amount));
    }

    {
        let getDesc = (level) => "\\beta=1.5^{" + level + "}";
        let getInfo = (level) => "\\beta=" + getBeta(level).toFixed(3);
        c2 = theory.createUpgrade(4, currency, new ExponentialCost(1, 1.5));
        c2.getDescription = (_) => Utils.getMath(getDesc(c2.level));
        c2.getInfo = (amount) => Utils.getMathTo(getInfo(c2.level), getInfo(c2.level + amount));
    }

    theory.createPublicationUpgrade(0, currency, 1e8);
    theory.createBuyAllUpgrade(1, currency, 1e15);
    theory.createAutoBuyerUpgrade(2, currency, 1e25);

    theory.setMilestoneCost(new LinearCost(25, 25));

    {
        milestoneResonance = theory.createMilestoneUpgrade(0, 1);
        milestoneResonance.description = "Double growth near equilibrium";
        milestoneResonance.info = "When 0.5 < x/E < 1.5, \\dot{x} is doubled.";
        milestoneResonance.boughtOrRefunded = (_) => theory.invalidatePrimaryEquation();
    }

    {
        milestoneEquilibriumBoost = theory.createMilestoneUpgrade(1, 1);
        milestoneEquilibriumBoost.description = "Equilibrium log boost";
        milestoneEquilibriumBoost.info = "Adds 0.1\\log_{10}(x) per second to \\log_{10}(E).";
        milestoneEquilibriumBoost.boughtOrRefunded = (_) => theory.invalidateSecondaryEquation();
    }

    {
        milestoneStressFeedback = theory.createMilestoneUpgrade(2, 1);
        milestoneStressFeedback.description = "Stress-to-stability feedback";
        milestoneStressFeedback.info = "\\dot{S} gains +0.05\\sqrt{D}.";
        milestoneStressFeedback.boughtOrRefunded = (_) => theory.invalidateTertiaryEquation();
    }

    {
        milestoneExplosion = theory.createMilestoneUpgrade(3, 1);
        milestoneExplosion.description = "Stability surge";
        milestoneExplosion.info = "Currency growth is multiplied by 1+10e^{-D}.";
        milestoneExplosion.boughtOrRefunded = (_) => theory.invalidatePrimaryEquation();
    }
};

// ─── Tick ─────────────────────────────────────────────────────────────────────

var tick = (elapsedTime, multiplier) => {
    let dt   = elapsedTime * multiplier;
    let bonus = theory.publicationMultiplier;

    let A    = getA1(a1.level);
    let B    = getA2(a2.level);
    let C    = getC1(c1.level);
    let Al   = getAlpha(alpha.level);
    let beta = getBeta(c2.level);

    // ratio = x/E = 10^(logX - logE), clamped to avoid overflow in JS arithmetic
    let logRatio = logX - logE;
    let ratio    = Math.pow(10, Math.max(-50, Math.min(50, logRatio)));

    // ── d(logX)/dt ─────────────────────────────────────────────────────────────
    // Derived from: dx/dt = S * x * (1 - x/E) * beta / (1 + D)
    // d(logX)/dt  = dx / (x * LN10 * dt) = S * (1 - ratio) * beta / (LN10 * (1 + D))
    let dlogX = S * (1 - ratio) * beta / (LN10 * (1 + D));
    if (milestoneResonance.level > 0 && ratio > 0.5 && ratio < 1.5)
        dlogX *= 2;

    // ── logE: analytical solution for dE/dt = A*x^α - B*E ─────────────────────
    // Exact step: E(t+dt) = E_eq*(1 - exp(-B*dt)) + E(t)*exp(-B*dt)
    // where E_eq = (A/B) * x^α  →  logE_eq = log10(A/B) + α*logX
    // Written in log-space around the equilibrium to avoid overflow at any dt.
    {
        let logE_eq = Math.log10(A / B) + Al * logX;
        let decay   = Math.exp(-B * dt);
        let delta   = logE - logE_eq;          // <0 means E below equilibrium
        let bracket;
        if (delta < -15)
            bracket = 1 - decay;               // 10^delta ≈ 0
        else if (delta > 15)
            bracket = Math.pow(10, delta) * decay;
        else
            bracket = Math.pow(10, delta) * decay + (1 - decay);
        logE = logE_eq + (bracket > 0 ? Math.log10(bracket) : -300);
    }
    if (milestoneEquilibriumBoost.level > 0)
        // Add 0.1*log10(x) to d(logE)/dt so the milestone stays meaningful at all scales
        logE += 0.1 * logX * dt;

    // ── dS/dt ──────────────────────────────────────────────────────────────────
    // Linear decay term -0.005*S prevents S from growing without bound.
    // Equilibrium: S_eq ≈ C / 0.005 = 10 + 6*c1.level (when ratio ≈ 1)
    let dS = C - 0.05 * Math.abs(ratio - 1) - 0.005 * S;
    if (milestoneStressFeedback.level > 0)
        dS += 0.05 * Math.sqrt(Math.max(0, D));

    // ── dD/dt ──────────────────────────────────────────────────────────────────
    let dD = 0.1 * ratio * ratio - 0.1 * S - 0.003 * D;

    // ── Integrate ──────────────────────────────────────────────────────────────
    logX = logX + dlogX * dt;
    // logE is already updated by the analytical E block above
    S    = Math.max(0.01, S + dS * dt);
    D    = Math.max(0.1,  D + dD * dt);

    // ── Currency growth: Δρ = bonus * x * beta * dt ────────────────────────────
    let logDelta   = logX + Math.log10(Math.max(1e-300, beta * dt));
    let xBig       = BigNumber.from(10).pow(BigNumber.from(logDelta));
    let rhoDelta = xBig * bonus;

    if (milestoneExplosion.level > 0)
        rhoDelta = rhoDelta * BigNumber.from(1 + 10 * Math.exp(-D));

    currency.value += rhoDelta;

    theory.invalidatePrimaryEquation();
    theory.invalidateSecondaryEquation();
    theory.invalidateTertiaryEquation();
    theory.invalidateQuaternaryEquation();
};

// ─── State persistence ────────────────────────────────────────────────────────

var getInternalState = () => [logX, logE, S, D].join(" ");

var setInternalState = (state) => {
    let v = state.split(" ");
    if (v.length >= 4) {
        logX = parseFloat(v[0]);
        logE = parseFloat(v[1]);
        S    = parseFloat(v[2]);
        D    = parseFloat(v[3]);
    }
};

var postPublish = () => {
    logX = 0;
    logE = 0;
    S    = 1.0;
    D    = 0.1;
};

// ─── Equations ────────────────────────────────────────────────────────────────

var getPrimaryEquation = () => {
    theory.primaryEquationHeight = 75;
    let result = "\\dot{\\rho}=\\beta x,\\quad";
    result += "\\dot{x}=\\frac{\\beta Sx(1-x/E)}{1+D}";
    if (milestoneResonance.level > 0)
        result += "\\;[\\times2\\text{ near }E]";
    if (milestoneExplosion.level > 0)
        result += "\\;[\\times(1+10e^{-D})]";
    return result;
};

var getSecondaryEquation = () => {
    let result = "\\dot{E}=a_1 x^{\\alpha}-a_2 E";
    if (milestoneEquilibriumBoost.level > 0)
        result += ",\\;\\dot{\\log E}\\mathrel{+}=0.1\\log x";
    result += ",\\quad" + theory.latexSymbol + "=\\rho^{0.18}";
    return result;
};

var getTertiaryEquation = () => {
    let result = "\\dot{S}=c_1-0.05|x/E-1|-0.005S";
    if (milestoneStressFeedback.level > 0)
        result += "+0.05\\sqrt{D}";
    return result;
};

var getQuaternaryEquation = () => {
    let xStr = BigNumber.from(10).pow(BigNumber.from(logX)).toString();
    let eStr = BigNumber.from(10).pow(BigNumber.from(logE)).toString();
    return "x=" + xStr + ",\\;E=" + eStr + ",\\;S=" + S.toFixed(2) + ",\\;D=" + D.toFixed(2);
};

// ─── Tau & publication ────────────────────────────────────────────────────────

var getTau = () =>
    currency.value.max(BigNumber.ONE).pow(BigNumber.from(0.18));

var getPublicationMultiplier = (tau) =>
    tau.pow(BigNumber.from(0.85));

var getPublicationMultiplierFormula = (symbol) =>
    symbol + "^{0.85}";

var getCurrencyFromTau = (tau) =>
    [tau.max(BigNumber.ONE).pow(BigNumber.from(1 / 0.18)), currency.symbol];

var get2DGraphValue = () =>
    currency.value.sign * (BigNumber.ONE + currency.value.abs()).log10().toNumber();

init();
