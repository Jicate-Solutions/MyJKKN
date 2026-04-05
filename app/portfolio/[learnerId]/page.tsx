'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import {
  Trophy, Award, Star, Shield, Target, BookOpen, Flame,
  ExternalLink, Share2, Copy, Check, ChevronRight,
} from 'lucide-react';

// ============================================
// Types
// ============================================

interface PortfolioProfile {
  id: string;
  full_name: string;
  avatar_url: string | null;
  institution: string;
  programme: string;
}

interface PortfolioReputation {
  total_points: number;
  level: string;
  quests_completed: number;
  capabilities_demonstrated: number;
  peer_reviews_given: number;
  current_streak: number;
}

interface PortfolioBadge {
  id: string;
  name: string;
  description: string;
  icon_url: string | null;
  category: string;
  earned_at: string;
}

interface QuestCompletion {
  quest_id: string;
  title: string;
  problem_statement: string;
  deliverable_description: string;
  difficulty: string | null;
  quest_type: string | null;
  completed_at: string;
  score: number | null;
}

interface CapabilityEntry {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  level: number;
  status: string;
  demonstrated_at: string | null;
  score: number | null;
}

interface CertificateEntry {
  id: string;
  certificate_number: string;
  certificate_type: string;
  issued_at: string;
  final_score: number | null;
  course_name: string;
  verification_url: string;
}

interface AgencyIndex {
  overall: number;
  level: string;
  dimensions: Record<string, number>;
  assessments_count: number;
}

interface PortfolioData {
  profile: PortfolioProfile;
  reputation: PortfolioReputation | null;
  badges: PortfolioBadge[];
  quest_completions: QuestCompletion[];
  capabilities: CapabilityEntry[];
  certificates: CertificateEntry[];
  agency_index: AgencyIndex | null;
  finks_profile: Record<string, number> | null;
}

// ============================================
// Constants
// ============================================

const LEVEL_CONFIG: Record<string, { label: string; color: string }> = {
  apprentice: { label: 'Apprentice', color: 'text-slate-600 bg-slate-100' },
  practitioner: { label: 'Practitioner', color: 'text-blue-600 bg-blue-100' },
  expert: { label: 'Expert', color: 'text-purple-600 bg-purple-100' },
  principal: { label: 'Principal', color: 'text-amber-600 bg-amber-100' },
  mentor: { label: 'Mentor', color: 'text-emerald-600 bg-emerald-100' },
};

const AGENCY_LEVEL_CONFIG: Record<string, { label: string; color: string }> = {
  dependent: { label: 'Dependent', color: 'text-red-600' },
  directed: { label: 'Directed', color: 'text-orange-600' },
  independent: { label: 'Independent', color: 'text-blue-600' },
  self_directed: { label: 'Self-Directed', color: 'text-purple-600' },
  principal: { label: 'Principal', color: 'text-emerald-600' },
};

const CAPABILITY_CATEGORY_COLORS: Record<string, string> = {
  ai_fluency: 'bg-blue-100 text-blue-700 border-blue-200',
  domain_ai: 'bg-purple-100 text-purple-700 border-purple-200',
  cross_functional: 'bg-orange-100 text-orange-700 border-orange-200',
  production: 'bg-green-100 text-green-700 border-green-200',
  human_presence: 'bg-pink-100 text-pink-700 border-pink-200',
  principal: 'bg-amber-100 text-amber-700 border-amber-200',
  technical: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  professional: 'bg-indigo-100 text-indigo-700 border-indigo-200',
};

const FINKS_LABELS: Record<string, string> = {
  foundational_knowledge: 'Foundational Knowledge',
  application: 'Application',
  integration: 'Integration',
  human_dimension: 'Human Dimension',
  caring: 'Caring',
  learning_how_to_learn: 'Learning How to Learn',
};

// ============================================
// Fink's Radar Chart (SVG)
// ============================================

function FinksRadarChart({ data }: { data: Record<string, number> }) {
  const dimensions = Object.keys(FINKS_LABELS);
  const center = 120;
  const maxRadius = 90;
  const levels = [20, 40, 60, 80, 100];

  const angleStep = (2 * Math.PI) / dimensions.length;
  const offset = -Math.PI / 2; // Start from top

  function polarToCartesian(angle: number, radius: number) {
    return {
      x: center + radius * Math.cos(angle + offset),
      y: center + radius * Math.sin(angle + offset),
    };
  }

  // Build polygon path for data
  const dataPoints = dimensions.map((dim, i) => {
    const value = data[dim] || 0;
    const radius = (value / 100) * maxRadius;
    return polarToCartesian(i * angleStep, radius);
  });
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + 'Z';

  return (
    <svg viewBox="0 0 240 240" className="w-full max-w-[280px] mx-auto">
      {/* Grid circles */}
      {levels.map(level => {
        const r = (level / 100) * maxRadius;
        const points = dimensions.map((_, i) => polarToCartesian(i * angleStep, r));
        const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + 'Z';
        return <path key={level} d={path} fill="none" stroke="#e5e7eb" strokeWidth="0.5" />;
      })}

      {/* Axis lines */}
      {dimensions.map((_, i) => {
        const p = polarToCartesian(i * angleStep, maxRadius);
        return <line key={i} x1={center} y1={center} x2={p.x} y2={p.y} stroke="#d1d5db" strokeWidth="0.5" />;
      })}

      {/* Data polygon */}
      <path d={dataPath} fill="rgba(11, 109, 65, 0.15)" stroke="#0b6d41" strokeWidth="2" />

      {/* Data points */}
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill="#0b6d41" />
      ))}

      {/* Labels */}
      {dimensions.map((dim, i) => {
        const p = polarToCartesian(i * angleStep, maxRadius + 18);
        const label = FINKS_LABELS[dim] || dim;
        const shortLabel = label.length > 14 ? label.slice(0, 12) + '...' : label;
        return (
          <text
            key={dim}
            x={p.x}
            y={p.y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-slate-600"
            fontSize="7"
            fontWeight="500"
          >
            {shortLabel}
          </text>
        );
      })}

      {/* Center value labels */}
      {dimensions.map((dim, i) => {
        const value = data[dim] || 0;
        const radius = (value / 100) * maxRadius;
        const p = polarToCartesian(i * angleStep, Math.max(radius - 12, 8));
        return (
          <text
            key={`val-${dim}`}
            x={p.x}
            y={p.y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-emerald-700"
            fontSize="8"
            fontWeight="700"
          >
            {value}
          </text>
        );
      })}
    </svg>
  );
}

// ============================================
// Main Portfolio Page
// ============================================

export default function PublicPortfolioPage() {
  const params = useParams();
  const learnerId = params?.learnerId as string;
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!learnerId) return;
    fetch(`/api/pde/portfolio/${learnerId}`)
      .then(res => res.json())
      .then(json => {
        if (json.success) {
          setData(json.data);
        } else {
          setError(json.error || 'Failed to load portfolio');
        }
      })
      .catch(() => setError('Failed to load portfolio'))
      .finally(() => setLoading(false));
  }, [learnerId]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fbfbee] flex items-center justify-center">
        <div className="animate-pulse space-y-4 w-full max-w-2xl px-4">
          <div className="h-8 bg-gray-200 rounded w-1/3" />
          <div className="h-4 bg-gray-200 rounded w-1/2" />
          <div className="h-32 bg-gray-200 rounded" />
          <div className="h-32 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#fbfbee] flex items-center justify-center">
        <div className="text-center space-y-4">
          <Shield className="w-16 h-16 text-gray-400 mx-auto" />
          <h1 className="text-2xl font-bold text-gray-700">Portfolio Not Found</h1>
          <p className="text-gray-500">{error || 'This portfolio does not exist or has been removed.'}</p>
        </div>
      </div>
    );
  }

  const { profile, reputation, badges, quest_completions, capabilities, certificates, agency_index, finks_profile } = data;
  const levelConfig = LEVEL_CONFIG[reputation?.level || 'apprentice'] || LEVEL_CONFIG.apprentice;

  return (
    <div className="min-h-screen bg-[#fbfbee]">
      {/* Header */}
      <header className="bg-[#0b6d41] text-white py-6 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <Link href="/" className="text-white/80 hover:text-white text-sm font-medium">
              JKKN Institutions
            </Link>
            <button
              onClick={handleCopyLink}
              className="flex items-center gap-1.5 text-sm bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-md transition-colors"
            >
              {copied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
              {copied ? 'Copied!' : 'Share'}
            </button>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center overflow-hidden flex-shrink-0">
              {profile.avatar_url ? (
                <Image src={profile.avatar_url} alt={profile.full_name} width={64} height={64} className="rounded-full object-cover" />
              ) : (
                <span className="text-2xl font-bold">{profile.full_name.charAt(0)}</span>
              )}
            </div>
            <div>
              <h1 className="text-2xl font-bold">{profile.full_name}</h1>
              {profile.institution && (
                <p className="text-white/80 text-sm">{profile.institution}</p>
              )}
              {profile.programme && (
                <p className="text-white/60 text-sm">{profile.programme}</p>
              )}
            </div>
          </div>

          {/* Stats bar */}
          <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-white/20">
            {reputation && (
              <>
                <div className="flex items-center gap-1.5">
                  <Trophy className="w-4 h-4 text-[#ffde59]" />
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${levelConfig.color}`}>
                    {levelConfig.label}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-sm text-white/80">
                  <Star className="w-4 h-4" />
                  <span>{reputation.total_points} pts</span>
                </div>
              </>
            )}
            <div className="flex items-center gap-1.5 text-sm text-white/80">
              <Award className="w-4 h-4" />
              <span>{badges.length} badges</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-white/80">
              <Target className="w-4 h-4" />
              <span>{quest_completions.length} quests</span>
            </div>
            {reputation && reputation.current_streak > 0 && (
              <div className="flex items-center gap-1.5 text-sm text-white/80">
                <Flame className="w-4 h-4 text-orange-300" />
                <span>{reputation.current_streak} day streak</span>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* Agency Index */}
        {agency_index && (
          <section>
            <h2 className="text-lg font-bold text-[#0b6d41] mb-3 flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Agency Index
            </h2>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-4xl font-bold text-[#0b6d41]">{agency_index.overall}</div>
                  <div className={`text-sm font-semibold ${AGENCY_LEVEL_CONFIG[agency_index.level]?.color || 'text-gray-600'}`}>
                    {AGENCY_LEVEL_CONFIG[agency_index.level]?.label || agency_index.level}
                  </div>
                </div>
                <div className="text-sm text-gray-500">
                  Based on {agency_index.assessments_count} assessment{agency_index.assessments_count !== 1 ? 's' : ''}
                </div>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {Object.entries(agency_index.dimensions).map(([key, value]) => (
                  <div key={key} className="text-center">
                    <div className="text-xs text-gray-500 capitalize mb-1">
                      {key.replace(/_/g, ' ')}
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#0b6d41] rounded-full transition-all"
                        style={{ width: `${value}%` }}
                      />
                    </div>
                    <div className="text-xs font-semibold text-gray-700 mt-0.5">{value}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Fink's Taxonomy Profile */}
        {finks_profile && (
          <section>
            <h2 className="text-lg font-bold text-[#0b6d41] mb-3 flex items-center gap-2">
              <BookOpen className="w-5 h-5" />
              Fink&apos;s Taxonomy Profile
            </h2>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <FinksRadarChart data={finks_profile} />
            </div>
          </section>
        )}

        {/* Quests Completed */}
        {quest_completions.length > 0 && (
          <section>
            <h2 className="text-lg font-bold text-[#0b6d41] mb-3 flex items-center gap-2">
              <Target className="w-5 h-5" />
              Quests Completed ({quest_completions.length})
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {quest_completions.map(quest => (
                <div key={quest.quest_id} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-gray-900 text-sm">{quest.title}</h3>
                    {quest.score != null && (
                      <span className="text-xs font-bold text-[#0b6d41] bg-emerald-50 px-2 py-0.5 rounded-full">
                        {quest.score}%
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 line-clamp-2 mb-2">{quest.problem_statement}</p>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    {quest.difficulty && (
                      <span className="capitalize">{quest.difficulty}</span>
                    )}
                    {quest.quest_type && (
                      <>
                        <span>&middot;</span>
                        <span className="capitalize">{quest.quest_type.replace(/_/g, ' ')}</span>
                      </>
                    )}
                    {quest.completed_at && (
                      <>
                        <span>&middot;</span>
                        <span>{new Date(quest.completed_at).toLocaleDateString()}</span>
                      </>
                    )}
                  </div>
                  <div className="mt-2 pt-2 border-t border-gray-100">
                    <p className="text-xs text-gray-600">
                      <span className="font-medium">Deliverable:</span> {quest.deliverable_description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Capabilities Demonstrated */}
        {capabilities.length > 0 && (
          <section>
            <h2 className="text-lg font-bold text-[#0b6d41] mb-3 flex items-center gap-2">
              <Star className="w-5 h-5" />
              Capabilities Demonstrated ({capabilities.length})
            </h2>
            <div className="flex flex-wrap gap-2">
              {capabilities.map(cap => {
                const catColor = CAPABILITY_CATEGORY_COLORS[cap.category] || 'bg-gray-100 text-gray-700 border-gray-200';
                return (
                  <div
                    key={cap.id}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${catColor}`}
                  >
                    {cap.status === 'mastered' && <Star className="w-3 h-3" />}
                    {cap.name}
                    <span className="opacity-60">L{cap.level}</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Certificates Earned */}
        {certificates.length > 0 && (
          <section>
            <h2 className="text-lg font-bold text-[#0b6d41] mb-3 flex items-center gap-2">
              <Award className="w-5 h-5" />
              Certificates Earned ({certificates.length})
            </h2>
            <div className="space-y-2">
              {certificates.map(cert => (
                <div key={cert.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900 text-sm">{cert.course_name || cert.certificate_type.replace(/_/g, ' ')}</h3>
                    <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                      <span className="font-mono">{cert.certificate_number}</span>
                      <span>&middot;</span>
                      <span>{new Date(cert.issued_at).toLocaleDateString()}</span>
                      {cert.final_score != null && (
                        <>
                          <span>&middot;</span>
                          <span className="font-semibold text-[#0b6d41]">{cert.final_score}%</span>
                        </>
                      )}
                    </div>
                  </div>
                  <Link
                    href={cert.verification_url}
                    className="flex items-center gap-1 text-xs text-[#0b6d41] hover:underline"
                    target="_blank"
                  >
                    Verify <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Badges */}
        {badges.length > 0 && (
          <section>
            <h2 className="text-lg font-bold text-[#0b6d41] mb-3 flex items-center gap-2">
              <Trophy className="w-5 h-5" />
              Badges ({badges.length})
            </h2>
            <div className="flex flex-wrap gap-3">
              {badges.map(badge => (
                <div key={badge.id} className="bg-white rounded-xl border border-gray-200 p-3 text-center w-24">
                  <div className="w-10 h-10 mx-auto mb-1.5 bg-amber-50 rounded-full flex items-center justify-center">
                    {badge.icon_url ? (
                      <Image src={badge.icon_url} alt={badge.name} width={24} height={24} />
                    ) : (
                      <Award className="w-5 h-5 text-amber-600" />
                    )}
                  </div>
                  <div className="text-xs font-semibold text-gray-800 truncate">{badge.name}</div>
                  <div className="text-[10px] text-gray-400">{new Date(badge.earned_at).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Empty state */}
        {quest_completions.length === 0 && capabilities.length === 0 && certificates.length === 0 && (
          <div className="text-center py-12">
            <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-gray-500">Portfolio in Progress</h3>
            <p className="text-sm text-gray-400 mt-1">This Learner is building their portfolio. Check back soon!</p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-6 mt-12 bg-white">
        <div className="max-w-4xl mx-auto px-4 flex items-center justify-between text-xs text-gray-400">
          <span>JKKN Institutions &mdash; Principal Development Engine</span>
          <button
            onClick={handleCopyLink}
            className="flex items-center gap-1 hover:text-gray-600 transition-colors"
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Link Copied' : 'Copy Link'}
          </button>
        </div>
      </footer>
    </div>
  );
}
