#!/usr/bin/env bash
# Script de expansão da equipe Maestri - Prisma Player
# Execute com: bash scripts/maestri-expand-team.sh
set -e

echo "🚀 Iniciando expansão da equipe Maestri..."

# === MARKETING (5 terminais) ===
echo "📢 Recrutando Marketing Lead..."
maestri recruit "Marketing Lead" --preset "Claude Code" --color green

echo "📝 Recrutando Content Writers..."
maestri recruit "Content Writer 1" --preset "Claude Code" --color green
maestri recruit "Content Writer 2" --preset "Claude Code" --color green
maestri recruit "Content Writer 3" --preset "Claude Code" --color green

echo "🔍 Recrutando SEO/Growth Specialist..."
maestri recruit "SEO Growth Specialist" --preset "Claude Code" --color green

# === FRONTEND (5 terminais) ===
echo "🎨 Recrutando Frontend Devs..."
maestri recruit "Frontend Dev 1" --preset "Claude Code" --color blue
maestri recruit "Frontend Dev 2" --preset "Claude Code" --color blue
maestri recruit "Frontend Dev 3" --preset "Claude Code" --color blue
maestri recruit "Frontend Dev 4" --preset "Claude Code" --color blue
maestri recruit "Frontend Dev 5" --preset "Claude Code" --color blue

# === BACKEND (3 terminais) ===
echo "⚙️ Recrutando Backend Devs..."
maestri recruit "Backend Dev 1" --preset "Claude Code" --color orange
maestri recruit "Backend Dev 2" --preset "Claude Code" --color orange
maestri recruit "Backend Dev 3" --preset "Claude Code" --color orange

# === QA & TESTING (3 terminais) ===
echo "🧪 Recrutando QA Team..."
maestri recruit "QA Lead" --preset "Claude Code" --color yellow
maestri recruit "QA Tester 1" --preset "Claude Code" --color yellow
maestri recruit "QA Tester 2" --preset "Claude Code" --color yellow

# === DEVOPS/SRE (2 terminais) ===
echo "🔧 Recrutando DevOps..."
maestri recruit "DevOps Engineer 1" --preset "Claude Code" --color cyan
maestri recruit "DevOps Engineer 2" --preset "Claude Code" --color cyan

# === CODE REVIEWERS (2 terminais) ===
echo "👀 Recrutando Code Reviewers..."
maestri recruit "Code Reviewer 1" --preset "Claude Code" --color magenta
maestri recruit "Code Reviewer 2" --preset "Claude Code" --color magenta

# === PRODUCT & GROWTH ===
echo "📊 Recrutando Product & Growth..."
maestri recruit "Product Lead" --preset "Claude Code" --color purple
maestri recruit "Growth Lead" --preset "Claude Code" --color purple

# === DESIGN/UI (2 terminais) ===
echo "🎭 Recrutando Designers..."
maestri recruit "UI Designer 1" --preset "Claude Code" --color pink
maestri recruit "UI Designer 2" --preset "Claude Code" --color pink

# === LEGAL & COMPLIANCE ===
echo "⚖️ Recrutando Legal..."
maestri recruit "Legal Compliance" --preset "Claude Code" --color gray

# === CUSTOMER SUCCESS ===
echo "💬 Recrutando Customer Success..."
maestri recruit "Customer Success" --preset "Claude Code" --color teal

# === RESEARCHER ===
echo "🔬 Recrutando Researcher..."
maestri recruit "Market Researcher" --preset "Claude Code" --color indigo

echo ""
echo "✅ Expansão concluída! Total de novos agentes recrutados."
echo "📋 Verifique com: maestri list"
echo "🎯 Backlog central já criado: '🎯 Backlog do Orquestrador'"