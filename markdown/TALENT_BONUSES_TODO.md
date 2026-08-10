# Talent Stat Bonuses Implementation Checklist

This file tracks which talent bonuses need to be implemented in the character stats system.

---

## HUNTER

### Primary Stats
- [ ] **Survivalist** (Survival) - Health +2%/4%/6%/8%/10% (5 ranks)
- [ ] **Lightning Reflexes** (Survival) - Agility +2%/4%/6%/8%/10% (5 ranks)

### Attack Power
- [ ] **Lightning Reflexes** (Survival) - Melee AP = +20%/40%/60%/80%/100% of Agility (5 ranks)

### Critical Strike
- [ ] **Lethal Shots** (Marksmanship) - Ranged Crit +1%/2%/3%/4%/5% (5 ranks)
- [ ] **Killer Instinct** (Survival) - All Attacks Crit +1%/2%/3% (3 ranks)

### Hit Chance
- [ ] **Surefooted** (Survival) - Hit Chance +1%/2%/3% (3 ranks)

### Avoidance
- [ ] **Swift Reflexes** (Survival) - Parry +1%/2% (2 ranks)

### Attack Speed
- [ ] **Swift Reflexes** (Survival) - Attack Speed +1%/2% (2 ranks)

---

## MAGE

### Critical Strike
- [ ] **Arcane Impact** (Arcane) - Arcane Spell Crit +2%/4%/6% (3 ranks)
- [ ] **Critical Mass** (Fire) - Fire Spell Crit +2%/4%/6% (3 ranks)

### Resistances
- [ ] **Magic Absorption** (Arcane) - All Resistances +4/7/10 (3 ranks)

### Spell Damage
- [ ] **Fire Power** (Fire) - Fire Spell Damage +2%/4%/6%/8%/10% (5 ranks)
- [ ] **Piercing Ice** (Frost) - Frost Spell Damage +2%/4%/6% (3 ranks)

### Armor (Conditional - requires buff active)
- [ ] **Frost Warding** (Frost) - Frost/Ice Armor effectiveness +15%/30% (2 ranks)
  - *Note: Only applies when Frost Armor or Ice Armor is active*

---

## PRIEST

### Primary Stats
- [ ] **Mental Strength** (Discipline) - Intellect +2%/4%/6%/8%/10% (5 ranks)
- [ ] **Spirit of Redemption** (Holy) - Spirit +5% (1 rank)

### Critical Strike
- [ ] **Divinity** (Holy) - Holy/Discipline Spell Crit +1%/2%/3%/4%/5% (5 ranks)
- [ ] **Force of Will** (Discipline) - Offensive Spell Crit +1%/2%/3%/4%/5% (5 ranks)

### Spell Damage & Healing
- [ ] **Force of Will** (Discipline) - Spell Damage +1%/2%/3%/4%/5% (5 ranks)
- [ ] **Spiritual Guidance** (Holy) - Spell Damage/Healing = +5%/10%/15%/20%/25% of Spirit (5 ranks)
- [ ] **Spiritual Healing** (Holy) - Healing +2%/4%/6%/10%/15%/20%/25%/30% (5 ranks)
- [ ] **Darkness** (Shadow) - Shadow Spell Damage +2%/4%/6%/8%/10% (5 ranks)
- [ ] **Shadowform** (Shadow) - Shadow Spell Damage +15% (1 rank)
  - *Note: Only when in Shadowform*

### Casting Speed
- [ ] **Mental Strength** (Discipline) - Spell Casting Speed +1%/2%/3% (3 ranks)

### Damage Reduction
- [ ] **Shadowform** (Shadow) - Physical Damage Taken -15% (1 rank)
  - *Note: Only when in Shadowform*
- [ ] **Spell Warding** (Holy) - Spell Damage Taken -2%/4%/6%/8%/10% (5 ranks)

### Armor (Conditional - requires buff active)
- [ ] **Improved Inner Fire** (Discipline) - Inner Fire effectiveness +15%/30% (2 ranks)
  - *Note: Only applies when Inner Fire is active*

---

## ROGUE

### Critical Strike
- [ ] **Malice** (Assassination) - Melee Crit +1%/2%/3%/4%/5% (5 ranks)
- [ ] **Close Quarters Combat** (Combat) - Mace/Dagger/Fist Crit +3%/5% (2 ranks)

### Hit Chance
- [ ] **Precision** (Combat) - Melee Hit +1%/2%/3%/4%/5% (5 ranks)

### Avoidance
- [ ] **Lightning Reflexes** (Combat) - Dodge +1%/2%/3%/4%/5% (5 ranks)
- [ ] **Deflection** (Combat) - Parry +1%/2%/3%/4%/5% (5 ranks)

### Weapon Skill
- [ ] **Weapon Expertise** (Combat) - Axe/Dagger/Fist/Mace/Sword Skill +3/+5 (2 ranks)

### Attack Speed
- [ ] **Blade Rush** (Combat) - Melee Attack Speed +3%/5% (2 ranks)

---

## WARLOCK

### Primary Stats
- [ ] **Demonic Embrace** (Demonology) - Stamina +3%/6%/9%/12%/15%, Spirit -1%/2%/3%/4%/5% (5 ranks)

### Critical Strike
- [ ] **Devastation** (Destruction) - Destruction Spell Crit +1%/2%/3%/4%/5% (5 ranks)
- [ ] **Master Demonologist** (Demonology) - Spell Crit +2%/4%/6%/8%/10% when Greater Demon active (5 ranks)
  - *Note: Conditional - requires Felguard/Infernal/Doomguard active*

### Spell Damage
- [ ] **Shadow Mastery** (Affliction) - Shadow Spell Damage +2%/4%/6%/8%/10% (5 ranks)
- [ ] **Emberstorm** (Destruction) - Fire Spell Damage +2%/4%/6%/8%/10% (5 ranks)
- [ ] **Demonic Sacrifice** (Demonology) - Spell Damage +4% when Imp sacrificed (1 rank)
  - *Note: Conditional - requires Imp sacrifice active*
- [ ] **Master Demonologist** (Demonology) - All Damage +2%/4%/6%/8%/10% when Succubus active (5 ranks)
  - *Note: Conditional - requires Succubus active*

### Damage Reduction
- [ ] **Master Demonologist** (Demonology) - Physical Damage Taken -2%/4%/6%/8%/10% when Voidwalker active (5 ranks)
  - *Note: Conditional - requires Voidwalker active*

### Armor (Conditional - requires buff active)
- [ ] **Demonic Aegis** (Demonology) - Demon Armor effectiveness +20%/40%/60% (3 ranks)
  - *Note: Only applies when Demon Armor is active*

---

## IMPLEMENTATION NOTES

### Priority Levels
1. **HIGH PRIORITY** - Simple % bonuses to primary stats and basic combat stats
2. **MEDIUM PRIORITY** - Conditional bonuses that require buff tracking
3. **LOW PRIORITY** - Pet-dependent bonuses (Warlock Master Demonologist)

### Conditional Bonuses
Some bonuses require checking if certain conditions are met:
- **Buff Active**: Frost/Ice Armor, Inner Fire, Demon Armor, Shadowform
- **Pet Active**: Master Demonologist (varies by pet type)
- **Sacrifice Active**: Demonic Sacrifice (Imp)

### Technical Considerations
- Stat conversion bonuses (Spiritual Guidance: spell power from Spirit)
- Multiple bonuses to same stat need to stack correctly
- Conditional bonuses need UI indication when active/inactive
- Need to recalculate stats when talents change

---

## PROGRESS TRACKER

- [ ] Hunter - 0/9 bonuses implemented
- [ ] Mage - 0/6 bonuses implemented
- [ ] Priest - 0/11 bonuses implemented
- [ ] Rogue - 0/7 bonuses implemented
- [ ] Warlock - 0/8 bonuses implemented

**Total: 0/41 bonuses implemented**
