'use client'

import { useState } from 'react'

const MONTHS = ['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep']
const SUBJECTS = [
  { code: 'AHS301', name: 'Community Health Nursing', max: 50, scored: 50 },
  { code: 'AHS302', name: 'Medical Surgical Nursing II', max: 50, scored: 50 },
  { code: 'AHS303', name: 'Mental Health Nursing', max: 50, scored: 50 },
  { code: 'AHS304', name: 'Midwifery & Obstetrics', max: 50, scored: 50 },
  { code: 'AHS305', name: 'Nursing Research & Stats', max: 50, scored: 50 },
  { code: 'AHS306', name: 'Clinical Practicum III', max: 100, scored: 100 },
]

const BARRIERS = [
  { icon: '💰', title: 'Full Funding', desc: 'NIF covers all costs. Zero from your pocket. Phase-wise release based on progress.', color: '#0b6d41' },
  { icon: '📋', title: 'Full On-Duty', desc: 'All working days covered. No attendance issues. Set up on MyJKKN upfront.', color: '#1a7a4e' },
  { icon: '📊', title: 'Full Internal Marks', desc: 'Your academics won\'t suffer. Configured on MyJKKN upfront.', color: '#2a875b' },
  { icon: '🏆', title: 'Innovation Scholarship', desc: 'Up to ₹1,00,000/year. Issued for redemption within 30 days.', color: '#3a9468' },
]

export default function SolveFor100Preview() {
  const [activeTab, setActiveTab] = useState<'attendance' | 'marks' | 'barriers'>('attendance')

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f5f5f0',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      maxWidth: 430,
      margin: '0 auto',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Status bar mock */}
      <div style={{
        background: '#0b6d41',
        padding: '8px 20px 0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: 12,
        color: 'rgba(255,255,255,0.9)',
        fontWeight: 600,
      }}>
        <span>4:45 PM</span>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 10 }}>5G</span>
          <div style={{ width: 18, height: 10, border: '1px solid rgba(255,255,255,0.8)', borderRadius: 2, position: 'relative' }}>
            <div style={{ position: 'absolute', left: 1, top: 1, bottom: 1, right: 3, background: 'rgba(255,255,255,0.9)', borderRadius: 1 }} />
            <div style={{ position: 'absolute', right: -3, top: 3, width: 2, height: 4, background: 'rgba(255,255,255,0.6)', borderRadius: 1 }} />
          </div>
        </div>
      </div>

      {/* App header */}
      <div style={{
        background: 'linear-gradient(135deg, #0b6d41 0%, #0a5c37 100%)',
        padding: '12px 20px 20px',
        position: 'relative',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          <span style={{ color: 'white', fontSize: 15, fontWeight: 600, letterSpacing: 0.3 }}>MyJKKN</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </div>
        </div>

        {/* Profile card */}
        <div style={{
          display: 'flex',
          gap: 14,
          alignItems: 'center',
        }}>
          <div style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: 'linear-gradient(135deg, #ffde59 0%, #f5c842 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
            fontWeight: 800,
            color: '#0b6d41',
            border: '2px solid rgba(255,255,255,0.3)',
            flexShrink: 0,
          }}>
            KR
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: 'white', fontSize: 17, fontWeight: 700, lineHeight: 1.2 }}>
              KAVIYA R
            </div>
            <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 3, lineHeight: 1.4 }}>
              Engineering &bull; Computer Science<br />
              Semester 5 &bull; Section A
            </div>
          </div>
        </div>

        {/* Founder badge */}
        <div style={{
          marginTop: 14,
          background: 'rgba(255, 222, 89, 0.15)',
          border: '1px solid rgba(255, 222, 89, 0.4)',
          borderRadius: 12,
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: 'linear-gradient(135deg, #ffde59 0%, #f0b800 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            flexShrink: 0,
          }}>
            🚀
          </div>
          <div>
            <div style={{ color: '#ffde59', fontSize: 13, fontWeight: 700, letterSpacing: 0.5 }}>
              SOLVE FOR 100 — STARTUP FOUNDER
            </div>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 2 }}>
              Sarvam Galatta 36 &bull; Team Golden Hawks &bull; Active
            </div>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex',
        background: 'white',
        borderBottom: '1px solid #e8e8e0',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        {[
          { key: 'attendance' as const, label: 'Attendance' },
          { key: 'marks' as const, label: 'Internal Marks' },
          { key: 'barriers' as const, label: '4 Barriers' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              flex: 1,
              padding: '14px 8px 12px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab.key ? '3px solid #0b6d41' : '3px solid transparent',
              color: activeTab === tab.key ? '#0b6d41' : '#888',
              fontSize: 13,
              fontWeight: activeTab === tab.key ? 700 : 500,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content area */}
      <div style={{ padding: '16px 16px 100px' }}>

        {/* ATTENDANCE TAB */}
        {activeTab === 'attendance' && (
          <div>
            <div style={{
              background: 'white',
              borderRadius: 16,
              padding: 20,
              marginBottom: 14,
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 12, color: '#888', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                    Overall Attendance
                  </div>
                  <div style={{ fontSize: 36, fontWeight: 800, color: '#0b6d41', lineHeight: 1.1, marginTop: 4 }}>
                    100%
                  </div>
                </div>
                <div style={{
                  background: 'linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%)',
                  borderRadius: 12,
                  padding: '8px 14px',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: 11, color: '#2e7d32', fontWeight: 600 }}>STATUS</div>
                  <div style={{ fontSize: 14, color: '#1b5e20', fontWeight: 800, marginTop: 2 }}>FULL OD</div>
                </div>
              </div>

              <div style={{
                background: 'linear-gradient(135deg, #0b6d41 0%, #15803d 100%)',
                borderRadius: 10,
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}>
                <span style={{ fontSize: 20 }}>✅</span>
                <div>
                  <div style={{ color: 'white', fontSize: 13, fontWeight: 700 }}>
                    On-Duty — Solve for 100 Founder
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 1 }}>
                    Full semester coverage &bull; Set up upfront on MyJKKN
                  </div>
                </div>
              </div>
            </div>

            <div style={{
              background: 'white',
              borderRadius: 16,
              padding: 20,
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#333', marginBottom: 14 }}>
                Monthly Breakdown — Sem 5 (2026)
              </div>
              {MONTHS.map((month, i) => {
                const isFuture = i > 0
                return (
                  <div key={month} style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '12px 0',
                    borderBottom: i < MONTHS.length - 1 ? '1px solid #f0f0e8' : 'none',
                  }}>
                    <div style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: isFuture ? '#f5f5f0' : '#e8f5e9',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      fontWeight: 700,
                      color: isFuture ? '#888' : '#2e7d32',
                      marginRight: 12,
                      flexShrink: 0,
                    }}>
                      {month}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>
                        {isFuture ? 'Upcoming' : 'March 2026'}
                      </div>
                      <div style={{ fontSize: 11, color: '#888', marginTop: 1 }}>
                        {isFuture ? 'Auto-approved OD' : '24 / 24 working days'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {!isFuture ? (
                        <>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#0b6d41' }}>100%</span>
                          <div style={{
                            width: 22, height: 22, borderRadius: 6, background: '#0b6d41',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>
                          </div>
                        </>
                      ) : (
                        <>
                          <span style={{ fontSize: 11, color: '#aaa', fontWeight: 500 }}>OD</span>
                          <div style={{
                            width: 22, height: 22, borderRadius: 6, background: '#e8f5e9',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#66bb6a" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* MARKS TAB */}
        {activeTab === 'marks' && (
          <div>
            <div style={{
              background: 'white',
              borderRadius: 16,
              padding: 20,
              marginBottom: 14,
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 12, color: '#888', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                    Internal Assessment
                  </div>
                  <div style={{ fontSize: 36, fontWeight: 800, color: '#0b6d41', lineHeight: 1.1, marginTop: 4 }}>
                    350/350
                  </div>
                </div>
                <div style={{
                  background: 'linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%)',
                  borderRadius: 12,
                  padding: '8px 14px',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: 11, color: '#2e7d32', fontWeight: 600 }}>GRADE</div>
                  <div style={{ fontSize: 14, color: '#1b5e20', fontWeight: 800, marginTop: 2 }}>FULL</div>
                </div>
              </div>

              <div style={{
                background: 'linear-gradient(135deg, #0b6d41 0%, #15803d 100%)',
                borderRadius: 10,
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}>
                <span style={{ fontSize: 20 }}>📊</span>
                <div>
                  <div style={{ color: 'white', fontSize: 13, fontWeight: 700 }}>
                    Full Internal Marks — Startup Founder
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 1 }}>
                    Awarded upfront &bull; Configured on MyJKKN
                  </div>
                </div>
              </div>
            </div>

            <div style={{
              background: 'white',
              borderRadius: 16,
              padding: 20,
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#333', marginBottom: 14 }}>
                Subject-Wise Internal Marks
              </div>
              {SUBJECTS.map((sub, i) => (
                <div key={sub.code} style={{
                  padding: '14px 0',
                  borderBottom: i < SUBJECTS.length - 1 ? '1px solid #f0f0e8' : 'none',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 10, color: '#aaa', fontWeight: 600, letterSpacing: 0.5 }}>{sub.code}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#333', marginTop: 2 }}>{sub.name}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <span style={{ fontSize: 16, fontWeight: 800, color: '#0b6d41' }}>{sub.scored}</span>
                      <span style={{ fontSize: 12, color: '#aaa' }}>/{sub.max}</span>
                    </div>
                  </div>
                  <div style={{ height: 6, background: '#f0f0e8', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: '100%',
                      background: 'linear-gradient(90deg, #0b6d41 0%, #22c55e 100%)',
                      borderRadius: 3,
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* BARRIERS TAB */}
        {activeTab === 'barriers' && (
          <div>
            <div style={{
              background: 'linear-gradient(135deg, #0b6d41 0%, #15803d 50%, #1a7a4e 100%)',
              borderRadius: 20,
              padding: 24,
              marginBottom: 16,
              textAlign: 'center',
              position: 'relative',
              overflow: 'hidden',
            }}>
              <div style={{
                position: 'absolute', top: -30, right: -30, width: 100, height: 100,
                borderRadius: '50%', background: 'rgba(255,222,89,0.1)',
              }} />
              <div style={{
                position: 'absolute', bottom: -20, left: -20, width: 80, height: 80,
                borderRadius: '50%', background: 'rgba(255,255,255,0.05)',
              }} />
              <div style={{ fontSize: 40, marginBottom: 8 }}>🛡️</div>
              <div style={{ color: '#ffde59', fontSize: 22, fontWeight: 800, lineHeight: 1.2, marginBottom: 6 }}>
                4 Barriers<br />Removed
              </div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
                JKKN&apos;s promise to every Solve for 100 Founder
              </div>
            </div>

            {BARRIERS.map((b, i) => (
              <div key={i} style={{
                background: 'white', borderRadius: 14, padding: 16, marginBottom: 10,
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                display: 'flex', alignItems: 'center', gap: 14,
                borderLeft: `4px solid ${b.color}`,
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: `${b.color}12`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 22, flexShrink: 0,
                }}>
                  {b.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#222' }}>{b.title}</div>
                  <div style={{ fontSize: 12, color: '#666', marginTop: 2, lineHeight: 1.4 }}>{b.desc}</div>
                </div>
                <div style={{
                  width: 24, height: 24, borderRadius: 7, background: '#0b6d41',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>
                </div>
              </div>
            ))}

            <div style={{
              background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12,
              padding: 14, marginTop: 6, display: 'flex', alignItems: 'flex-start', gap: 10,
            }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e' }}>Reviewed Each Semester</div>
                <div style={{ fontSize: 11, color: '#a16207', marginTop: 3, lineHeight: 1.5 }}>
                  These privileges are given upfront. If you&apos;re building, we&apos;re backing you. If you stop, the privileges stop too.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom nav mock */}
      <div style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 430, background: 'white',
        borderTop: '1px solid #e8e8e0', display: 'flex', padding: '8px 0 24px', zIndex: 20,
      }}>
        {[
          { icon: '🏠', label: 'Home', active: false },
          { icon: '📚', label: 'Academics', active: true },
          { icon: '🚀', label: 'Startup', active: false },
          { icon: '👤', label: 'Profile', active: false },
        ].map((nav, i) => (
          <div key={i} style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: 2, cursor: 'pointer',
          }}>
            <span style={{ fontSize: 20 }}>{nav.icon}</span>
            <span style={{
              fontSize: 10, fontWeight: nav.active ? 700 : 400,
              color: nav.active ? '#0b6d41' : '#888',
            }}>
              {nav.label}
            </span>
          </div>
        ))}
      </div>

      {/* PREVIEW ribbon */}
      <div style={{
        position: 'fixed', top: 80, right: -28, transform: 'rotate(45deg)',
        background: 'rgba(255,222,89,0.9)', color: '#0b6d41',
        fontSize: 9, fontWeight: 800, padding: '4px 40px', letterSpacing: 1.5, zIndex: 30,
      }}>
        PREVIEW
      </div>
    </div>
  )
}
