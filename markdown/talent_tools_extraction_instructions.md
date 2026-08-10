# Talent Extraction Instructions - All Classes

## Classes to Extract (in order)
1. Druid - https://talents.turtlecraft.gg/druid
2. Warrior - https://talents.turtlecraft.gg/warrior
3. Paladin - https://talents.turtlecraft.gg/paladin
4. Rogue - https://talents.turtlecraft.gg/rogue
5. Mage - https://talents.turtlecraft.gg/mage
6. Warlock - https://talents.turtlecraft.gg/warlock
7. Priest - https://talents.turtlecraft.gg/priest
8. Hunter - https://talents.turtlecraft.gg/hunter

## For Each Class:

### Step 1: Extract Talent Data
1. Open the URL for the class (e.g., https://talents.turtlecraft.gg/druid)
2. Press F12 to open DevTools
3. Go to Console tab
4. Paste the extraction script (see below)
5. JSON will be copied to clipboard
6. Save to: `Testing/talent_tools/extracted_data/<classname>_talents_raw.json`

### Step 2: Position Talents
1. Open: `Testing/talent_tools/talent_position_mapper.html` in browser
2. Load the raw JSON file
3. Drag talents to match the grid layout on https://talents.turtlecraft.gg/<classname>
4. Add connections by clicking prerequisite first, then dependent talent
5. Export and save to: `Testing/talent_tools/extracted_data/<classname>_talents_positioned.json`

### Step 3: Create Module
1. Copy positioned JSON
2. Format as ES6 module
3. Save to: `modules/<classname>_talents.js`
4. Update `modules/talents_new.js` imports
5. Test in app

---

## Extraction Script (Copy/Paste into Browser Console)

```javascript
// Extract talent data from Turtle WoW talent calculator
const talents = [];
const trees = [];

// Get all talent trees
document.querySelectorAll('.TalentTreeBranch_branchWrapper__zjgDq').forEach((tree, treeIndex) => {
    const treeName = tree.querySelector('.TalentTreeBranch_header__YN-Pk').textContent.trim();
    const treeIcon = tree.querySelector('.TalentTreeBranch_iconHolder__Q7yHT img').src.match(/icons\/([^.]+)/)[1];

    const treeTalents = [];

    tree.querySelectorAll('.Talent_talentHolder__1XmYC').forEach((talent, talentIndex) => {
        const name = talent.querySelector('.Talent_talentName__P\\+qpN')?.textContent.trim();
        if (!name) return;

        const icon = talent.querySelector('.Talent_iconHolder__T6CJd img')?.src.match(/icons\/medium\/([^.]+)/)?.[1];
        const ranksText = talent.querySelector('.Talent_ranks__lFNfL')?.textContent.trim();
        const ranks = ranksText ? parseInt(ranksText.split('/')[1]) : 1;

        const description = talent.querySelector('.Talent_description__gZC\\+R')?.innerHTML || '';

        // Extract values from description (numbers in bold tags)
        const values = [];
        const boldMatches = description.matchAll(/<b[^>]*>([^<]+)<\/b>/g);
        for (const match of boldMatches) {
            const val = match[1].trim();
            if (val && !isNaN(parseFloat(val.replace('%', '').replace(',', '')))) {
                const numericVal = val.replace('%', '').replace(',', '').trim();
                values.push(numericVal);
            }
        }

        // Clean description
        let cleanDesc = description.replace(/<[^>]+>/g, '');
        if (values.length > 0) {
            const firstValPattern = new RegExp(`${values[0]}%?`);
            const match = cleanDesc.match(firstValPattern);
            if (match) {
                cleanDesc = cleanDesc.substring(0, match.index).trim();
            }
        }
        cleanDesc = cleanDesc.trim();

        treeTalents.push({
            id: talentIndex + 1,
            name: name,
            icon: icon,
            ranks: ranks,
            values: values,
            description: cleanDesc,
            requires: null,
            reqRanks: null
        });
    });

    trees.push({
        name: treeName,
        icon: treeIcon,
        talents: treeTalents
    });
});

const output = {
    class: "ClassName",
    source: "Turtle WoW",
    lastParsed: new Date().toISOString(),
    totalTalents: trees.reduce((sum, tree) => sum + tree.talents.length, 0),
    trees: trees
};

console.log(JSON.stringify(output, null, 2));
copy(JSON.stringify(output, null, 2));
console.log("✓ JSON copied to clipboard!");
```

---

## File Structure

```
Testing/talent_tools/
├── extraction_instructions.md (this file)
├── talent_position_mapper.html (positioning tool)
└── extracted_data/
    ├── druid_talents_raw.json
    ├── druid_talents_positioned.json
    ├── warrior_talents_raw.json
    ├── warrior_talents_positioned.json
    └── ... (for all classes)
```
