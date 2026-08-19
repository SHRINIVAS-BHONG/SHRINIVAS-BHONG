const fs = require('fs');
const path = require('path');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const USERNAME = process.env.GITHUB_USERNAME || 'SHRINIVAS-BHONG';

// GraphQL query explicitly structured to avoid hardcoded dates.
// It inherently returns the last 365 days of activity up to today.
const query = `
  query($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              contributionCount
              date
            }
          }
        }
      }
    }
  }
`;

async function fetchGitHubData() {
    console.log(`Fetching data for ${USERNAME}...`);
    const response = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${GITHUB_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables: { login: USERNAME } })
    });

    if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    if (data.errors) {
        throw new Error(`GraphQL Error: ${JSON.stringify(data.errors)}`);
    }

    return data.data.user.contributionsCollection.contributionCalendar;
}

function processData(calendar) {
    const days = calendar.weeks.flatMap(w => w.contributionDays);
    const total = calendar.totalContributions;
    
    // Split the year into 4 sequential chunks (quarters)
    const chunkSize = Math.ceil(days.length / 4);
    const quarters = [];
    
    for (let i = 0; i < 4; i++) {
        const chunk = days.slice(i * chunkSize, (i + 1) * chunkSize);
        const chunkTotal = chunk.reduce((sum, day) => sum + day.contributionCount, 0);
        quarters.push(chunkTotal);
    }

    // Normalize intensity. We use a base of 60 contributions per quarter as "1.0 intensity"
    // to ensure the visual looks good even if absolute numbers vary.
    const intensities = quarters.map(q => Math.min(1, q / 60));
    
    console.log(`Total Contributions: ${total}`);
    console.log(`Days Analyzed: ${days.length}`);
    console.log(`Quarterly Intensities (Q1->Q4): ${intensities.map(i => i.toFixed(2)).join(', ')}`);

    return { total, intensities };
}

function generateSVG({ total, intensities }) {
    // Structural layout for the neural network layers
    const layers = [6, 5, 4, 3, 1];
    const xOffsets = [150, 325, 500, 675, 850];
    const centerY = 160;
    const nodeSpacing = 40;

    let svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 350" width="100%" height="100%">
    <defs>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <filter id="glow-strong" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
    </defs>

    <!-- Base Loss Landscape Curve -->
    <path d="M 50 80 Q 400 340 850 280" fill="none" stroke="#334155" stroke-width="2" stroke-dasharray="4 4" />
    <circle cx="850" cy="280" r="7" fill="#22C55E" filter="url(#glow-strong)">
        <animate attributeName="opacity" values="0.4;1;0.4" dur="2s" repeatCount="indefinite"/>
    </circle>
    
    <!-- Text Labels -->
    <text x="50" y="70" fill="#64748b" font-family="monospace" font-size="10" font-weight="bold">HIGH LOSS (INPUT)</text>
    <text x="865" y="285" fill="#64748b" font-family="monospace" font-size="10" font-weight="bold">GLOBAL MINIMUM</text>
    <text x="450" y="335" fill="#64748b" font-family="monospace" font-size="10" opacity="0.6">OPTIMIZATION TRAJECTORY</text>
`;

    // Generate Nodes
    const nodes = [];
    for (let l = 0; l < layers.length; l++) {
        let count = layers[l];
        let startY = centerY - ((count - 1) * nodeSpacing) / 2;
        for (let n = 0; n < count; n++) {
            nodes.push({ layer: l, x: xOffsets[l], y: startY + n * nodeSpacing });
        }
    }

    // Generate Links and Particles (Mapping GitHub data to AI Activity)
    for (let i = 0; i < nodes.length; i++) {
        const source = nodes[i];
        if (source.layer === layers.length - 1) continue; // Final layer has no outgoing

        const targets = nodes.filter(n => n.layer === source.layer + 1);
        const layerIntensity = intensities[source.layer] || 0.1; 
        
        // Activity controls link opacity
        const linkOpacity = 0.15 + (layerIntensity * 0.4);
        
        targets.forEach(target => {
            // Draw static connection
            svg += `    <line x1="${source.x}" y1="${source.y}" x2="${target.x}" y2="${target.y}" stroke="#334155" stroke-width="1.5" opacity="${linkOpacity}" />\n`;

            // Activity controls particle presence and speed
            const isActive = Math.random() < (0.3 + layerIntensity * 0.7);
            if (isActive) {
                // Higher intensity = faster particles (lower duration)
                const baseDur = 4.0 - (layerIntensity * 2.5); 
                const dur = baseDur + (Math.random() * 1.0); 
                const delay = Math.random() * 3.0;
                
                // Color mapping: Highest activity gets bright blue, normal gets indigo
                const pColor = layerIntensity > 0.6 ? '#38BDF8' : '#6366F1';
                
                svg += `    <circle r="3.5" fill="${pColor}" filter="url(#glow)">
        <animateMotion dur="${dur.toFixed(2)}s" begin="${delay.toFixed(2)}s" repeatCount="indefinite" path="M ${source.x} ${source.y} L ${target.x} ${target.y}" />
        <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.9;1" dur="${dur.toFixed(2)}s" begin="${delay.toFixed(2)}s" repeatCount="indefinite" />
    </circle>\n`;
            }
        });
    }

    // Draw Nodes over links
    nodes.forEach(node => {
        svg += `    <circle cx="${node.x}" cy="${node.y}" r="4" fill="#111827" stroke="#334155" stroke-width="2" />\n`;
        // Activity-based pulsing for nodes
        const layerIntensity = intensities[node.layer] || 0.1;
        if (layerIntensity > 0.2) {
            svg += `    <circle cx="${node.x}" cy="${node.y}" r="5" fill="#6366F1" opacity="0" filter="url(#glow)">
        <animate attributeName="opacity" values="0;${(layerIntensity * 0.8).toFixed(2)};0" dur="${2 + Math.random()}s" begin="${Math.random()*2}s" repeatCount="indefinite" />
    </circle>\n`;
        }
    });

    svg += `</svg>`;
    return svg;
}

async function main() {
    try {
        if (!GITHUB_TOKEN) throw new Error("GITHUB_TOKEN is missing!");
        
        const calendar = await fetchGitHubData();
        const data = processData(calendar);
        const svgContent = generateSVG(data);

        const distDir = path.join(process.cwd(), 'dist');
        if (!fs.existsSync(distDir)) {
            fs.mkdirSync(distDir, { recursive: true });
        }

        const outputPath = path.join(distDir, 'neural-activity.svg');
        fs.writeFileSync(outputPath, svgContent);
        
        console.log(`Successfully generated: ${outputPath}`);
    } catch (error) {
        console.error('Workflow failed:', error.message);
        process.exit(1);
    }
}

main();