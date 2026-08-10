/**
 * Display formulas for stat weight calculations
 * @param {string} statType - The type of stat (avoidance, stamina, defense, armor, blockvalue, blockchance)
 * @param {Object} results - Simulation results containing stat weights
 * @param {Object} totals - Character totals from calculator
 * @param {Object} boss - Boss data with minDamage and maxDamage
 */
export function displayStatWeightFormula(statType, results, totals, boss) {
    const formulaDiv = document.getElementById('stat-weight-formula');
    const titleEl = document.getElementById('formula-title');
    const contentEl = document.getElementById('formula-content');

    if (!formulaDiv || !titleEl || !contentEl) return;

    // Toggle visibility if clicking the same stat
    const currentStat = formulaDiv.dataset.currentStat;
    if (currentStat === statType && formulaDiv.style.display === 'block') {
        formulaDiv.style.display = 'none';
        formulaDiv.dataset.currentStat = '';
        return;
    }

    formulaDiv.dataset.currentStat = statType;
    formulaDiv.style.display = 'block';

    // Calculate values from available data
    const avgBossDamage = (boss.minDamage + boss.maxDamage) / 2;
    const currentDR = totals.physicalDR || 0;
    const avgDamageAfterDR = avgBossDamage * (1 - currentDR);
    const health = totals.health || 0;

    // Use ACTUAL character stats from totals (not simulated percentages)
    // These match what's shown in the stat breakdown
    const actualDodge = totals.dodge || 0;
    const actualParry = totals.parry || 0;
    const actualBlock = totals.block || 0;
    
    // Calculate miss chance from defense (5% base + 0.04% per defense above 300)
    const defense = totals.defense || 0;
    const missChance = 5.0 + Math.max(0, (defense - 300) * 0.04);
    
    // True avoidance = dodge + parry + miss (actual character stats)
    const trueAvoidance = actualDodge + actualParry + missChance;
    
    const estimatedDamagePerAttack = avgDamageAfterDR * (1 - trueAvoidance / 100);
    const attacksToKill = estimatedDamagePerAttack > 0 ? health / estimatedDamagePerAttack : 0;

    // Use ACTUAL block chance from character totals
    const blockChance = actualBlock;
    const currentCritChance = Math.max(0, 5.6 - Math.max(0, (defense - 300) * 0.04));
    const crushChance = 15.0;
    // Use ACTUAL totalMitigation from character totals (not simulated results)
    // This matches what's shown in the stat breakdown (95.94%)
    const totalMitigation = totals.totalMitigation !== undefined ? totals.totalMitigation : (trueAvoidance + blockChance);
    const normalHitDamage = avgDamageAfterDR;
    const crushDamage = normalHitDamage * 1.5;
    const critDamage = normalHitDamage * 2.0;
    const blockValue = totals.blockValue || 0;

    const formulas = {
        avoidance: {
            title: '1% Avoidance EHP Calculation',
            sections: [
                {
                    label: 'What it does:',
                    text: null,
                    explanation: 'Avoidance (dodge/parry/miss) completely negates attacks (0 damage), unlike block which converts them. Due to attack table order (Miss → Dodge → Parry → Block → Crit → Crush → Normal), what avoidance prevents depends on total mitigation level.'
                },
                {
                    label: 'Attack Table Mechanics:',
                    text: `Attack table order: Miss → Dodge → Parry → Block → Crit → Crush → Normal
True avoidance: ${trueAvoidance.toFixed(2)}% (dodge + parry + miss only)
Block chance: ${blockChance.toFixed(2)}%
Total mitigation: ${totalMitigation.toFixed(2)}% (avoidance + block)
Boss crit chance: ${currentCritChance.toFixed(2)}%
Boss crush chance: ${crushChance.toFixed(2)}%`,
                    explanation: `Your true avoidance is ${trueAvoidance.toFixed(2)}% (dodge + parry + miss). Block (${blockChance.toFixed(2)}%) converts crits/crushes to blocked hits, which helps push them off the attack table. Your total mitigation (${totalMitigation.toFixed(2)}% = avoidance + block) determines which zone you're in.`
                },
                ...(totalMitigation >= 100 - currentCritChance ? [
                    {
                        label: 'Current Zone: Crit Zone',
                        text: `Total mitigation (${totalMitigation.toFixed(2)}%) ≥ ${(100 - currentCritChance).toFixed(2)}%
You are avoiding crits! Adding 1% avoidance prevents crits (2x damage).`,
                        explanation: `In this zone, adding 1% avoidance completely negates crits that would deal ${critDamage.toFixed(0)} damage.`
                    },
                    {
                        label: 'Formula (Crit Zone):',
                        text: `Crit damage: ${critDamage.toFixed(0)}
Damage prevented per avoided attack: ${critDamage.toFixed(0)} (complete negation)

With 1% more avoidance: 0.01 × ${critDamage.toFixed(0)} = ${(0.01 * critDamage).toFixed(1)}

EHP gain = ${(0.01 * critDamage).toFixed(1)} × ${attacksToKill.toFixed(2)}
= ${(0.01 * critDamage * attacksToKill).toFixed(0)} EHP`,
                        explanation: `Avoidance completely negates ${critDamage.toFixed(0)} damage crits, saving the full ${critDamage.toFixed(0)} per avoided attack.`
                    }
                ] : totalMitigation >= 100 - crushChance - currentCritChance ? [
                    {
                        label: 'Current Zone: Crush Zone',
                        text: `Total mitigation (${totalMitigation.toFixed(2)}%) ≥ ${(100 - crushChance - currentCritChance).toFixed(2)}%
You are avoiding crushes! Adding 1% avoidance prevents crushes (1.5x damage).`,
                        explanation: `In this zone, adding 1% avoidance completely negates crushes that would deal ${crushDamage.toFixed(0)} damage.`
                    },
                    {
                        label: 'Formula (Crush Zone):',
                        text: `Crush damage: ${crushDamage.toFixed(0)}
Damage prevented per avoided attack: ${crushDamage.toFixed(0)} (complete negation)

With 1% more avoidance: 0.01 × ${crushDamage.toFixed(0)} = ${(0.01 * crushDamage).toFixed(1)}

EHP gain = ${(0.01 * crushDamage).toFixed(1)} × ${attacksToKill.toFixed(2)}
= ${(0.01 * crushDamage * attacksToKill).toFixed(0)} EHP`,
                        explanation: `Avoidance completely negates ${crushDamage.toFixed(0)} damage crushes, saving the full ${crushDamage.toFixed(0)} per avoided attack.`
                    }
                ] : [
                    {
                        label: 'Current Zone: NORMAL',
                        text: `Total mitigation (${totalMitigation.toFixed(2)}%) < ${(100 - crushChance - currentCritChance).toFixed(2)}%
Not yet crush immune. Adding 1% avoidance prevents normal hits (1x damage).`,
                        explanation: `In this zone, adding 1% avoidance completely negates normal hits that would deal ${normalHitDamage.toFixed(0)} damage.`
                    },
                    {
                        label: 'Formula (Normal Zone):',
                        text: `Normal hit damage: ${normalHitDamage.toFixed(0)}
Damage prevented per avoided attack: ${normalHitDamage.toFixed(0)} (complete negation)

With 1% more avoidance: 0.01 × ${normalHitDamage.toFixed(0)} = ${(0.01 * normalHitDamage).toFixed(1)}

EHP gain = ${(0.01 * normalHitDamage).toFixed(1)} × ${attacksToKill.toFixed(2)}
= ${(0.01 * normalHitDamage * attacksToKill).toFixed(0)} EHP`,
                        explanation: `Avoidance completely negates ${normalHitDamage.toFixed(0)} damage normal hits, saving the full ${normalHitDamage.toFixed(0)} per avoided attack.`
                    }
                ]),
                {
                    label: 'Key Insight:',
                    text: null,
                    explanation: 'Avoidance becomes MUCH more valuable as you approach crush immunity (80%+) and crit immunity (94.4%+) because it starts preventing bigger hits (crushes/crits) instead of just normal hits. Unlike block which converts attacks to reduced damage, avoidance completely negates them (0 damage).'
                }
            ]
        },
        stamina: {
            title: '1 Stamina EHP Calculation',
            sections: [
                {
                    label: 'Formula:',
                    text: `EHP gain = HP gain ÷ (1 - DR)
${totals.stamina && health ? `
Current: ${totals.stamina.toFixed(0)} stamina → ${health.toLocaleString()} HP
HP per stamina: ${(health / totals.stamina).toFixed(1)} HP
` : '= 10 HP (base) ÷ (1 - DR)'}
With ${(currentDR * 100).toFixed(1)}% DR:
= ${totals.stamina && health ? (health / totals.stamina).toFixed(1) : '10'} HP ÷ ${(1 - currentDR).toFixed(3)}
= ${(results.statWeights?.stamina1EHP || (10 / (1 - currentDR))).toFixed(1)} EHP`,
                    explanation: `1 Stamina gives ${totals.stamina && health ? (health / totals.stamina).toFixed(1) : '10'} HP with your current buffs/talents. This HP is amplified by your damage reduction (${(currentDR * 100).toFixed(1)}%).`
                },
                {
                    label: 'Why NOT include avoidance:',
                    text: null,
                    explanation: 'Stamina value is ONLY amplified by DR, not by avoidance. Avoidance\'s contribution to survivability is already measured by the avoidance stat weight. Including it here would double-count avoidance\'s value.'
                },
                {
                    label: 'The key insight:',
                    text: null,
                    explanation: 'Each stat weight measures its independent contribution. Stamina gives raw HP (amplified by DR). Avoidance makes your HP pool last longer. They\'re separate, complementary contributions to survivability.'
                }
            ]
        },
        defense: {
            title: '1 Defense EHP Calculation',
            sections: [
                {
                    label: 'Defense provides two benefits:',
                    text: null,
                    explanation: '1) Avoidance: +0.04% miss, +0.04% dodge, +0.04% parry = 0.12% total avoidance\n2) Crit reduction: -0.04% boss crit chance (only if defense > 300)'
                },
                {
                    label: 'Part 1: Avoidance value (0.12%)',
                    text: `Normal hit damage = ${avgDamageAfterDR.toFixed(0)}
Normal hits to kill = ${health.toLocaleString()} ÷ ${avgDamageAfterDR.toFixed(0)} = ${(health / avgDamageAfterDR).toFixed(2)}

Avoidance EHP gain = (${avgDamageAfterDR.toFixed(0)} × 0.0012) × ${(health / avgDamageAfterDR).toFixed(2)}
= ${((avgDamageAfterDR * 0.0012) * (health / avgDamageAfterDR)).toFixed(1)} EHP`,
                    explanation: '0.12% avoidance prevents normal hits. Uses same formula as avoidance stat weight.'
                },
                {
                    label: 'Part 2: Crit reduction value',
                    text: `Boss crit chance: ${(Math.max(0, 5.6 - Math.max(0, (totals.defense - 300) * 0.04))).toFixed(2)}%
Crit damage: ${avgDamageAfterDR.toFixed(0)} × 2 = ${(avgDamageAfterDR * 2).toFixed(0)}
Normal damage: ${avgDamageAfterDR.toFixed(0)}
Damage difference: ${(avgDamageAfterDR * 2).toFixed(0)} - ${avgDamageAfterDR.toFixed(0)} = ${avgDamageAfterDR.toFixed(0)}

Damage prevented per attack = 0.04% × ${avgDamageAfterDR.toFixed(0)} = ${(0.0004 * avgDamageAfterDR).toFixed(2)}
EHP gain = ${(0.0004 * avgDamageAfterDR).toFixed(2)} × ${(health / avgDamageAfterDR).toFixed(2)}
= ${((0.0004 * avgDamageAfterDR) * (health / avgDamageAfterDR)).toFixed(1)} EHP`,
                    explanation: 'Reducing crit chance by 0.04% saves the DIFFERENCE between crit (2x) and normal (1x) damage, not the full crit damage.'
                },
                {
                    label: 'Total:',
                    text: `Total EHP from 1 defense ≈ ${((0.0012 * avgDamageAfterDR + 0.0004 * avgDamageAfterDR) * (health / avgDamageAfterDR)).toFixed(1)} EHP`,
                    explanation: 'Defense value = avoidance value + crit reduction value. Both parts scale with your HP.'
                }
            ]
        },
        armor: {
            title: '1 Armor EHP Calculation',
            sections: [
                {
                    label: 'Armor DR formula:',
                    text: `Armor DR = Armor ÷ (Armor + 400 + 85 × Boss Level)

Current armor: ${totals.armor.toLocaleString()}
Current armor DR: ${(totals.armor / (totals.armor + 400 + 85 * 63) * 100).toFixed(2)}%
Current total DR: ${(currentDR * 100).toFixed(2)}% (includes Defensive Stance, etc.)

With +1 armor:
Armor DR: ${((totals.armor + 1) / (totals.armor + 1 + 400 + 85 * 63) * 100).toFixed(4)}%
Armor DR increase: ${(((totals.armor + 1) / (totals.armor + 1 + 400 + 85 * 63) - totals.armor / (totals.armor + 400 + 85 * 63)) * 100).toFixed(4)}%`,
                    explanation: 'Armor DR is calculated separately, then combined multiplicatively with other DR sources (Defensive Stance, Shield Wall, etc.). More armor = higher DR (capped at 75%).'
                },
                {
                    label: 'EHP formula (without avoidance):',
                    text: `EHP = HP ÷ (1 - DR)

With current DR: EHP = ${health.toLocaleString()} ÷ ${(1 - currentDR).toFixed(3)}
= ${(health / (1 - currentDR)).toFixed(0)} EHP

With +1 armor: Small increase in DR → Small increase in EHP`,
                    explanation: 'Armor value is ONLY based on DR increase, not amplified by avoidance. Avoidance\'s value is measured separately. Each point of armor provides diminishing returns (less DR per point as armor increases).'
                }
            ]
        },
        blockvalue: {
            title: '1 Block Value EHP Calculation',
            sections: [
                {
                    label: 'What it does:',
                    text: null,
                    explanation: 'Block Value reduces damage on blocked hits. +1 block value means 1 less damage on each blocked attack. In all mitigation zones, the reduction is the same, but the baseline damage calculation differs.'
                },
                {
                    label: 'Attack Table Zones:',
                    text: null,
                    explanation: 'Block value works the same in all zones (+1 damage reduction per blocked hit), but we use different damage baselines:\n• Normal zone: Uses simulated average damage\n• Crush immune: Uses simulated average (crushes → blocked hits)\n• Crit immune: Uses simulated average (crits → blocked hits)'
                },
                {
                    label: 'Formula:',
                    text: `Block rate: ${(results.blockPercent || 0).toFixed(2)}%
Damage reduced per attack = Block rate × 1
= ${((results.blockPercent || 0) / 100).toFixed(3)} damage per attack

Simulated avg damage per attack: ${estimatedDamagePerAttack.toFixed(1)}
Attacks to kill = ${health.toLocaleString()} ÷ ${estimatedDamagePerAttack.toFixed(1)} = ${attacksToKill.toFixed(2)}

EHP gain = ${((results.blockPercent || 0) / 100).toFixed(3)} × ${attacksToKill.toFixed(2)}
= ${(((results.blockPercent || 0) / 100) * attacksToKill).toFixed(1)} EHP`,
                    explanation: `Adding 1 block value reduces ${((results.blockPercent || 0) / 100).toFixed(3)} damage per attack on average. Over ${attacksToKill.toFixed(2)} attacks you can survive, this equals ${(((results.blockPercent || 0) / 100) * attacksToKill).toFixed(1)} EHP.`
                },
                {
                    label: 'Scaling:',
                    text: null,
                    explanation: 'Block value scales with your block chance (more blocks = more value) and HP (more HP = more attacks survived). Uses simulated average damage that accounts for all attack types and current mitigation.'
                }
            ]
        },
        blockchance: {
            title: '1% Block Chance EHP Calculation',
            sections: [
                {
                    label: 'What it does:',
                    text: null,
                    explanation: 'Block chance converts attacks into blocked hits (reduced by block value). Due to attack table mechanics, what blocks prevent changes based on total mitigation level.'
                },
                {
                    label: 'Attack Table Mechanics:',
                    text: `Attack table order: Miss → Dodge → Parry → Block → Crit → Crush → Normal
Total mitigation: ${totalMitigation.toFixed(2)}% (avoidance + block)
Boss crit chance: ${currentCritChance.toFixed(2)}%
Boss crush chance: ${crushChance.toFixed(2)}%`,
                    explanation: `Blocks push attacks off the bottom of the table. Your total mitigation determines what gets pushed off.`
                },
                ...(totalMitigation >= 100 - currentCritChance ? [
                    {
                        label: 'Current Zone: CRIT IMMUNE',
                        text: `Total mitigation (${totalMitigation.toFixed(2)}%) ≥ ${(100 - currentCritChance).toFixed(2)}%
You are crit immune! Blocks prevent crits (2x damage).`,
                        explanation: `In this zone, adding 1% block converts crits to blocked normal hits.`
                    },
                    {
                        label: 'Formula (Crit Zone):',
                        text: `Crit damage: ${critDamage.toFixed(0)}
Blocked hit damage: ${Math.max(0, normalHitDamage - blockValue).toFixed(0)}
Damage prevented per blocked attack: ${(critDamage - Math.max(0, normalHitDamage - blockValue)).toFixed(0)}

With 1% more block: 0.01 × ${(critDamage - Math.max(0, normalHitDamage - blockValue)).toFixed(0)} = ${(0.01 * (critDamage - Math.max(0, normalHitDamage - blockValue))).toFixed(1)}

EHP gain = ${(0.01 * (critDamage - Math.max(0, normalHitDamage - blockValue))).toFixed(1)} × ${attacksToKill.toFixed(2)}
= ${(0.01 * (critDamage - Math.max(0, normalHitDamage - blockValue)) * attacksToKill).toFixed(0)} EHP`,
                        explanation: `Block converts ${critDamage.toFixed(0)} damage crit to ${Math.max(0, normalHitDamage - blockValue).toFixed(0)} damage blocked hit, saving ${(critDamage - Math.max(0, normalHitDamage - blockValue)).toFixed(0)} per block.`
                    }
                ] : totalMitigation >= 100 - crushChance - currentCritChance ? [
                    {
                        label: 'Current Zone: Crush Zone',
                        text: `Total mitigation (${totalMitigation.toFixed(2)}%) ≥ ${(100 - crushChance - currentCritChance).toFixed(2)}%
You are avoiding crushes! Blocks prevent crushes (1.5x damage).`,
                        explanation: `In this zone, adding 1% block converts crushes to blocked normal hits.`
                    },
                    {
                        label: 'Formula (Crush Zone):',
                        text: `Crush damage: ${crushDamage.toFixed(0)}
Blocked hit damage: ${Math.max(0, normalHitDamage - blockValue).toFixed(0)}
Damage prevented per blocked attack: ${(crushDamage - Math.max(0, normalHitDamage - blockValue)).toFixed(0)}

With 1% more block: 0.01 × ${(crushDamage - Math.max(0, normalHitDamage - blockValue)).toFixed(0)} = ${(0.01 * (crushDamage - Math.max(0, normalHitDamage - blockValue))).toFixed(1)}

EHP gain = ${(0.01 * (crushDamage - Math.max(0, normalHitDamage - blockValue))).toFixed(1)} × ${attacksToKill.toFixed(2)}
= ${(0.01 * (crushDamage - Math.max(0, normalHitDamage - blockValue)) * attacksToKill).toFixed(0)} EHP`,
                        explanation: `Block converts ${crushDamage.toFixed(0)} damage crush to ${Math.max(0, normalHitDamage - blockValue).toFixed(0)} damage blocked hit, saving ${(crushDamage - Math.max(0, normalHitDamage - blockValue)).toFixed(0)} per block.`
                    }
                ] : [
                    {
                        label: 'Current Zone: NORMAL',
                        text: `Total mitigation (${totalMitigation.toFixed(2)}%) < ${(100 - crushChance - currentCritChance).toFixed(2)}%
Not yet crush immune. Blocks prevent normal hits.`,
                        explanation: `In this zone, adding 1% block converts normal hits to blocked normal hits (just reduces by block value).`
                    },
                    {
                        label: 'Formula (Normal Zone):',
                        text: `Block value: ${blockValue}
Damage prevented per blocked attack: ${blockValue}

With 1% more block: 0.01 × ${blockValue} = ${(0.01 * blockValue).toFixed(1)}

EHP gain = ${(0.01 * blockValue).toFixed(1)} × ${attacksToKill.toFixed(2)}
= ${(0.01 * blockValue * attacksToKill).toFixed(0)} EHP`,
                        explanation: `Block just reduces normal hit damage by block value (${blockValue}). Much less valuable than in crush/crit immune zones.`
                    }
                ]),
                {
                    label: 'Key Insight:',
                    text: null,
                    explanation: 'Block chance becomes MUCH more valuable as you approach crush immunity (80%+) and crit immunity (94.4%+) because it starts preventing bigger hits instead of just normal hits.'
                }
            ]
        }
    };

    const formula = formulas[statType];
    if (!formula) return;

    titleEl.textContent = formula.title;

    contentEl.innerHTML = formula.sections.map(section => `
        <div class="formula-section">
            <div class="formula-label">${section.label}</div>
            ${section.text ? `<div class="formula-text">${section.text}</div>` : ''}
            <div class="formula-explanation">${section.explanation}</div>
        </div>
    `).join('');
}

