import { ExponentialCost, FirstFreeCost, LinearCost } from "./api/Costs";
import { BigNumber } from "./api/BigNumber";
import { QuaternaryEntry, theory } from "./api/Theory";
import { Utils } from "./api/Utils";

var id = "adaptive_multi_regime";
var name = "Adaptive Multi-Regime Stability";
var description =
    "A dynamical system of coupled variables drives currency growth through adaptive logistic mechanics.\n\n" +
    "x (position) chases E (equilibrium) via logistic growth, while E is driven by x raised to a power α. " +
    "S (stability) and D (stress) modulate growth, creating rich multi-regime behaviour.";
var authors = "pwwraisedd, melon";
var version = 10;
requiresGameVersion("1.4.33");

var logX = -1;
var logE = 0;
var S = 1.0;
var D = 0.1;
var t = 0;

var currency;
var a1, a2, c1, c2, alpha;
var milestoneResonance, milestoneEquilibriumBoost, milestoneStressFeedback, milestoneExplosion;

const LN10 = Math.log(10);

var getA1    = (level) => 0.1  + 0.05 * level;
var getA2    = (level) => 0.05 / (1 + level);
var getC1    = (level) => 0.05 + 0.03 * level;
var getAlpha = (level) => 1    + 0.02 * level;
var getBeta  = (level) => Math.pow(1.5, level);

var quaternary =
[
    new QuaternaryEntry('x', null),
    new QuaternaryEntry('E', null),
    new QuaternaryEntry('S', null),
    new QuaternaryEntry('D', null),
    new QuaternaryEntry(null, null),
    new QuaternaryEntry('t', null),
];

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

    theory.primaryEquationHeight = 75;
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

    theory.createStoryChapter(0, "First Contact",
        "x = 0.1. E = 1.\nThe gap yawns open.\nGrowth begins.",
        () => currency.value > BigNumber.from(1e4));

    theory.createStoryChapter(1, "Equilibrium Found",
        "x chases E. E chases x.\nNeither wins. Neither stops.\nThis is the regime.",
        () => currency.value > BigNumber.from(1e8));

    theory.createStoryChapter(2, "Resonance",
        "Near equilibrium, growth doubles.\nS climbs. D retreats to zero.\nThe system hums.",
        () => milestoneResonance.level > 0);

    theory.createStoryChapter(3, "Surge",
        "1 + 10e^{-D}.\nD is small. The multiplier is large.\nStability has its rewards.",
        () => milestoneExplosion.level > 0);

    updateAvailability();
};

var updateAvailability = () => {};

var tick = (elapsedTime, multiplier) => {
    t += elapsedTime;

    let dt    = elapsedTime * multiplier;
    let bonus = theory.publicationMultiplier;
    let A     = getA1(a1.level);
    let B     = getA2(a2.level);
    let C     = getC1(c1.level);
    let Al    = getAlpha(alpha.level);
    let beta  = getBeta(c2.level);

    let logRatio = logX - logE;
    let ratio    = Math.pow(10, Math.max(-50, Math.min(50, logRatio)));

    {
        let r = beta * S / (1 + D);
        if (milestoneResonance.level > 0 && ratio > 0.5 && ratio < 1.5) r *= 2;
        let denom = ratio + (1 - ratio) * Math.exp(-r * dt);
        logX = logE + Math.log10(Math.max(1e-300, denom > 1e-300 ? ratio / denom : 1.0));
    }

    {
        let logE_eq = Math.log10(A / B) + Al * logX;
        let decay   = Math.exp(-B * dt);
        let delta   = logE - logE_eq;
        let bracket;
        if (delta < -15)
            bracket = 1 - decay;
        else if (delta > 15)
            bracket = Math.pow(10, delta) * decay;
        else
            bracket = Math.pow(10, delta) * decay + (1 - decay);
        logE = logE_eq + (bracket > 0 ? Math.log10(bracket) : -300);
    }

    if (milestoneEquilibriumBoost.level > 0)
        logE += 0.1 * logX * dt;

    let dS = C - 0.05 * Math.abs(ratio - 1) - 0.005 * S;
    if (milestoneStressFeedback.level > 0)
        dS += 0.05 * Math.sqrt(Math.max(0, D));

    let dD = 0.1 * (ratio - 1) * (ratio - 1) - 0.01 * S * D - 0.003 * D;

    S = Math.max(0.01, S + dS * dt);
    D = Math.max(0,    D + dD * dt);

    let logDelta = logX + Math.log10(Math.max(1e-300, beta * dt));
    let xBig     = BigNumber.from(10).pow(BigNumber.from(logDelta));
    let rhoDelta = xBig * bonus;

    if (milestoneExplosion.level > 0)
        rhoDelta = rhoDelta * BigNumber.from(1 + 10 * Math.exp(-D));

    currency.value += rhoDelta;
    theory.invalidateTertiaryEquation();
    theory.invalidateQuaternaryValues();
};

var getInternalState = () => JSON.stringify({ logX, logE, S, D, t });

var setInternalState = (stateStr) => {
    if (!stateStr) return;
    let v = JSON.parse(stateStr);
    logX = v.logX ?? logX;
    logE = v.logE ?? logE;
    S    = v.S    ?? S;
    D    = v.D    ?? D;
    t    = v.t    ?? t;
};

var postPublish = () => {
    logX = -1;
    logE = 0;
    S    = 1.0;
    D    = 0.1;
    t    = 0;
};

var getPrimaryEquation = () => {
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

var getQuaternaryEntries = () => {
    let mins = Math.floor(t / 60);
    let secs = t - mins * 60;
    let hrs  = Math.floor(mins / 60);
    mins -= hrs * 60;

    quaternary[0].value = BigNumber.from(10).pow(BigNumber.from(logX)).toString();
    quaternary[1].value = BigNumber.from(10).pow(BigNumber.from(logE)).toString();
    quaternary[2].value = S.toFixed(2);
    quaternary[3].value = D.toFixed(2);
    quaternary[5].value = hrs + ":" + String(mins).padStart(2, "0") + ":" + secs.toFixed(1).padStart(4, "0");

    return quaternary;
};

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
