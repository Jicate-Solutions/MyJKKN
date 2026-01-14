**MyJKKN \+ MATLAB Deep Integration Requirements**

**Status:** DRAFT

**Created:** 2026-01-12

**Owner:** JKKN IT Team

**Priority:** HIGH (enables seamless MATLAB access for 10,000+ Learners)

 

**Executive Summary**

Deep integration between MyJKKN and MATLAB goes beyond basic LTI to enable:

| Integration Level | What It Enables |
| :---- | :---- |
| **Level 1: Links** | One-click access to MATLAB from MyJKKN |
| **Level 2: LTI 1.3** | SSO \+ grade sync \+ embedded assignments |
| **Level 3: Embedded MATLAB** | Run MATLAB code inside MyJKKN pages |
| **Level 4: MATLAB Backend** | MyJKKN executes MATLAB functions server-side |

**JKKN License enables ALL four levels** \- MATLAB Production Server, Web App Server, and Grader are all enabled.

 

**Current State**

| Platform | Capability | Status |
| :---- | :---- | :---- |
| MyJKKN | LTI Support | Needs implementation |
| MyJKKN | REST API calls | Ready (Next.js API routes) |
| MATLAB Grader | LTI 1.3 | Ready |
| MATLAB Production Server | REST API | Ready (licensed) |
| MATLAB Web App Server | Embedded apps | Ready (licensed) |
| MATLAB Online | Browser-based MATLAB | Ready |

**MyJKKN Tech Stack:**

●  	Frontend: Next.js 14 (App Router)

●  	Backend: Supabase (PostgreSQL)

●  	Auth: Supabase Auth

●  	Deployment: Vercel

 

**Integration Levels**

**Level 1: Link Integration (Simplest)**

Add MATLAB buttons/links to MyJKKN course pages.

// MyJKKN component  
\<Button onClick={() \=\> window.open('https://matlabacademy.mathworks.com/', '\_blank')}\>  
  Open MATLAB Academy  
\</Button\>

**What it enables:**

●  	Learners access MATLAB Academy training

●  	Senior Learners access MATLAB Grader for assignment creation

●  	Usage tracking via click analytics

 

**Level 2: LTI 1.3 Integration**

Full Learning Tools Interoperability standard implementation.

**Infrastructure:** Vercel \+ Supabase is sufficient \- no additional servers needed.

 

**Why LTI 1.3? (First Principles)**

| Without LTI | With LTI |
| :---- | :---- |
| Learners create separate MathWorks account | Single sign-on via MyJKKN |
| Senior Learners manually transfer grades | Grades auto-sync to MyJKKN |
| No visibility into MATLAB usage | Full analytics in MyJKKN dashboard |
| Learners forget to use MATLAB | MATLAB embedded in course flow |
| 7 users (current) | 10,000+ potential users |

**Core insight:** The blocker isn't MATLAB capability—it's friction. Every extra login, every manual step, every context switch loses Learners.

 

**Benefits of LTI Integration**

| Benefit | Impact | Measurement |
| :---- | :---- | :---- |
| **Zero friction access** | Click once in MyJKKN → land in MATLAB | Adoption rate increase |
| **No duplicate accounts** | MyJKKN identity \= MATLAB identity | Support tickets reduced |
| **Automatic grade sync** | Senior Learners save 5+ hours/week | Time tracking |
| **Usage analytics** | Know who's using MATLAB, when, how | Dashboard metrics |
| **Course integration** | MATLAB assignments appear in MyJKKN courses | Completion rates |
| **Scalable onboarding** | Add 1,000 Learners instantly | Zero manual work |

 

**MathWorks LTI 1.3 Endpoints**

| Parameter | Value |
| :---- | :---- |
| Tool Name | MATLAB Grader LTI 1.3 |
| Launch URL | https://learningtool.mathworks.com/v1p3/launch |
| Public Keyset | https://learningtool.mathworks.com/lti/jwk |
| OIDC Auth URL | https://learningtool.mathworks.com/lti/oidc |
| Redirect URI | https://learningtool.mathworks.com/lti/redirect |

 

**LTI Advantage Services**

| Service | What It Does | Value |
| :---- | :---- | :---- |
| Names and Roles | Sync MyJKKN roster to MATLAB Grader | Senior Learners don't manually add Learners |
| Assignment and Grade | Auto-sync grades back to MyJKKN | No manual grade entry |
| Deep Linking | Embed specific assignments in course pages | Learners stay in MyJKKN flow |

 

**Vercel \+ Supabase Implementation**

**Architecture:**

┌─────────────────┐   	┌──────────────────┐   	┌─────────────────┐  
│  MyJKKN     	│   	│ Vercel       	│   	│ MathWorks   	│  
│  Frontend   	│──────▶│ API Routes   	│──────▶│ LTI Service 	│  
│  (Next.js)  	│   	│ (/api/lti/\*) 	│   	│             	│  
└─────────────────┘   	└────────┬─────────┘   	└─────────────────┘  
                               	│  
                               	▼  
                      	┌──────────────────┐  
                      	│ Supabase     	│  
                      	│ PostgreSQL   	│  
                      	│ (lti\_\* tables)   │  
                      	└──────────────────┘

**Why This Works:**

●  	Vercel Edge Functions handle JWT signing/verification (CPU-light)

●  	Supabase stores LTI registrations and grade data

●  	No persistent server needed—LTI is stateless request/response

 

**Database Schema (Supabase)**

\-- LTI Tool Registrations  
CREATE TABLE lti\_tools (  
  id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),  
  name TEXT NOT NULL,  
  client\_id TEXT NOT NULL,  
  deployment\_id TEXT NOT NULL,  
  launch\_url TEXT NOT NULL,  
  public\_keyset\_url TEXT NOT NULL,  
  oidc\_auth\_url TEXT NOT NULL,  
  created\_at TIMESTAMPTZ DEFAULT NOW()  
);  
   
\-- LTI Launches (audit trail \+ analytics)  
CREATE TABLE lti\_launches (  
  id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),  
  user\_id UUID REFERENCES users(id),  
  tool\_id UUID REFERENCES lti\_tools(id),  
  context\_id TEXT,          	\-- Course ID  
  resource\_link\_id TEXT,    	\-- Assignment ID  
  launched\_at TIMESTAMPTZ DEFAULT NOW(),  
   
  \-- Analytics fields  
  institution TEXT,         	\-- Which JKKN college  
  user\_role TEXT            	\-- Learner/Senior Learner  
);  
   
\-- Grade Passback  
CREATE TABLE lti\_grades (  
  id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),  
  user\_id UUID REFERENCES users(id),  
  resource\_link\_id TEXT NOT NULL,  
  score DECIMAL(5,2),  
  max\_score DECIMAL(5,2),  
  received\_at TIMESTAMPTZ DEFAULT NOW(),  
   
  \-- Link to MyJKKN gradebook  
  synced\_to\_gradebook BOOLEAN DEFAULT FALSE,  
  gradebook\_entry\_id UUID  
);  
   
\-- RLS Policies  
ALTER TABLE lti\_tools ENABLE ROW LEVEL SECURITY;  
ALTER TABLE lti\_launches ENABLE ROW LEVEL SECURITY;  
ALTER TABLE lti\_grades ENABLE ROW LEVEL SECURITY;  
   
\-- Only admins can manage tools  
CREATE POLICY "Admins manage LTI tools" ON lti\_tools  
  FOR ALL USING (auth.jwt() \-\>\> 'role' \= 'admin');  
   
\-- Users see their own launches  
CREATE POLICY "Users see own launches" ON lti\_launches  
  FOR SELECT USING (user\_id \= auth.uid());  
   
\-- Users see their own grades  
CREATE POLICY "Users see own grades" ON lti\_grades  
  FOR SELECT USING (user\_id \= auth.uid());

 

**Vercel API Routes**

| Endpoint | Method | Purpose | Implementation |
| :---- | :---- | :---- | :---- |
| /api/lti/launch | POST | Initiate LTI launch | Build JWT, redirect to MathWorks |
| /api/lti/jwks | GET | Public keys for JWT verification | Serve RSA public key |
| /api/lti/auth | GET | OIDC authorization callback | Validate state, issue token |
| /api/lti/token | POST | Access token generation | OAuth 2.0 token exchange |
| /api/lti/grades | POST | Receive grade passback | Store in Supabase, sync gradebook |
| /api/lti/deep-link | POST | Content selection | Return selected assignment |

**Example: Launch Route**

// app/api/lti/launch/route.ts  
import { createClient } from '@supabase/supabase-js';  
import { SignJWT } from 'jose';  
   
export async function POST(req: Request) {  
  const supabase \= createClient(  
	process.env.NEXT\_PUBLIC\_SUPABASE\_URL\!,  
	process.env.SUPABASE\_SERVICE\_ROLE\_KEY\!  
  );  
   
  // Get current user from MyJKKN session  
  const { data: { user } } \= await supabase.auth.getUser();  
   
  // Get LTI tool config  
  const { data: tool } \= await supabase  
	.from('lti\_tools')  
	.select('\*')  
	.eq('name', 'MATLAB Grader')  
	.single();  
   
  // Build LTI 1.3 JWT  
  const token \= await new SignJWT({  
	iss: process.env.LTI\_CLIENT\_ID,  
	sub: user.id,  
	aud: tool.oidc\_auth\_url,  
	// LTI claims  
	'https://purl.imsglobal.org/spec/lti/claim/message\_type': 'LtiResourceLinkRequest',  
	'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',  
	'https://purl.imsglobal.org/spec/lti/claim/roles': \[  
  	mapJKKNRoleToLTI(user.role)  
	\],  
	// User info  
	name: user.full\_name,  
	email: user.email,  
  })  
	.setProtectedHeader({ alg: 'RS256', kid: process.env.LTI\_KEY\_ID })  
	.setIssuedAt()  
	.setExpirationTime('5m')  
	.sign(privateKey);  
   
  // Log launch for analytics  
  await supabase.from('lti\_launches').insert({  
	user\_id: user.id,  
	tool\_id: tool.id,  
	institution: user.institution,  
	user\_role: user.role,  
  });  
   
  // Redirect to MATLAB  
  return Response.redirect(\`${tool.launch\_url}?id\_token=${token}\`);  
}  
   
function mapJKKNRoleToLTI(role: string): string {  
  const mapping \= {  
	'learner': 'http://purl.imsglobal.org/vocab/lis/v2/membership\#Learner',  
	'senior\_learner': 'http://purl.imsglobal.org/vocab/lis/v2/membership\#Instructor',  
	'admin': 'http://purl.imsglobal.org/vocab/lis/v2/institution/person\#Administrator',  
  };  
  return mapping\[role\] || mapping\['learner'\];  
}

 

**Environment Variables (Vercel)**

| Variable | Purpose | Source |
| :---- | :---- | :---- |
| LTI\_CLIENT\_ID | MyJKKN's LTI client ID | MathWorks registration |
| LTI\_DEPLOYMENT\_ID | Deployment identifier | MathWorks registration |
| LTI\_PRIVATE\_KEY | RSA private key for JWT signing | Generate locally |
| LTI\_PUBLIC\_KEY | RSA public key (served at /api/lti/jwks) | Generate locally |
| LTI\_KEY\_ID | Key identifier | Generate locally |

 

**Registration Process**

1\. 	**Generate RSA Key Pair:**

   \`\`\`bash

   openssl genrsa \-out private.pem 2048

   openssl rsa \-in private.pem \-pubout \-out public.pem

   \`\`\`

2\. 	**Register with MathWorks:**

   \- Contact MathWorks LTI support

   \- Provide MyJKKN's:

 	\- OIDC Login URL: https://jkkn.ai/api/lti/auth

 	\- JWKS URL: https://jkkn.ai/api/lti/jwks

 	\- Redirect URI: https://jkkn.ai/api/lti/callback

3\. 	**Receive from MathWorks:**

   \- Client ID

   \- Deployment ID

   \- Their public keyset URL

4\. 	**Configure Vercel Environment:**

   \- Add all environment variables

   \- Deploy

 

**User Flow (Post-Integration)**

Learner in MyJKKN Course  
    	│  
    	▼  
Clicks "Open MATLAB Assignment"  
    	│  
    	▼  
MyJKKN builds JWT with Learner identity  
    	│  
    	▼  
Redirect to MathWorks with token  
    	│  
    	▼  
MathWorks validates JWT  
    	│  
    	▼  
Learner lands in MATLAB Grader (NO login needed)  
    	│  
    	▼  
Completes assignment  
    	│  
    	▼  
MathWorks sends grade to MyJKKN API  
    	│  
    	▼  
Grade appears in MyJKKN gradebook

**Learner experience:** Click once → do assignment → grade appears. Zero friction.

 

**Level 3: Embedded MATLAB (Tighter)**

Embed MATLAB execution directly in MyJKKN pages using MATLAB Web App Server.

**How It Works**

5\. 	Senior Learners create MATLAB apps using App Designer

6\. 	Apps deployed to MATLAB Web App Server

7\. 	Apps embedded in MyJKKN via iframe or JavaScript API

// MyJKKN page embedding a MATLAB web app  
\<iframe  
  src="https://matlab-webapp-server.jkkn.ac.in/apps/circuit-simulator"  
  className="w-full h-\[600px\]"  
/\>

**What it enables:**

●  	Custom MATLAB simulations embedded in course content

●  	Interactive visualizations (control systems, signal processing)

●  	No context switching \- Learners stay in MyJKKN

**MATLAB Web App Server Configuration**

| Setting | Value |
| :---- | :---- |
| Server URL | To be configured on JKKN infrastructure |
| Auth | Can use MATLAB Online license check |
| CORS | Allow jkkn.ai |

 

**Level 4: MATLAB Backend API (Tightest)**

MyJKKN backend calls MATLAB Production Server to execute functions.

**Architecture**

┌─────────────┐   	┌──────────────────┐   	┌─────────────────────┐  
│  MyJKKN 	│──────▶│ MyJKKN API   	│──────▶│ MATLAB Production   │  
│  Frontend   │   	│ Routes       	│   	│ Server          	│  
└─────────────┘   	└──────────────────┘   	└─────────────────────┘  
                          	│                       	│  
                          	▼                       	▼  
                  	"Run this MATLAB  	Execute MATLAB function  
                   	function with     	Return JSON result  
                   	these inputs"

**MATLAB Production Server REST API**

**Endpoint format:** POST /ctfArchive/functionName

**Request:**

{  
  "rhs": \[inputValue1, inputValue2\],  
  "nargout": 1,  
  "outputFormat": {"mode": "small"}  
}

**Response:** MATLAB output as JSON

**Example: Drug Interaction Checker (Pharmacy)**

// MyJKKN API route: /api/matlab/drug-interaction  
export async function POST(req: Request) {  
  const { drug1, drug2 } \= await req.json();  
   
  const response \= await fetch(  
	'https://matlab-server.jkkn.ac.in/pharmacy/checkInteraction',  
	{  
  	method: 'POST',  
  	headers: { 'Content-Type': 'application/json' },  
  	body: JSON.stringify({  
    	rhs: \[drug1, drug2\],  
    	nargout: 1  
  	})  
	}  
  );  
   
  return Response.json(await response.json());  
}

**What it enables:**

●  	Custom MATLAB algorithms accessible via MyJKKN UI

●  	Compute-heavy operations (simulations, ML models) on MATLAB server

●  	Domain-specific tools without Learners knowing MATLAB

 

**Recommended Implementation Path**

| Phase | What | Outcome |
| :---- | :---- | :---- |
| **Phase 1** | Link Integration | Immediate MATLAB access from MyJKKN |
| **Phase 2** | LTI 1.3 Core | SSO launch into MATLAB Grader |
| **Phase 3** | LTI Grade Passback | Automatic grade sync |
| **Phase 4** | Deep Linking | Embed specific assignments |
| **Phase 5** | Web App Embedding | Custom MATLAB apps in MyJKKN |
| **Phase 6** | Backend API | MATLAB-powered MyJKKN features |

 

**Technical Requirements**

**Security**

☐ HTTPS on all endpoints

☐ JWT signing with RS256

☐ CORS configuration for MathWorks domains

☐ Nonce validation for OIDC

**User Role Mapping**

| MyJKKN Role | LTI Role |
| :---- | :---- |
| Learner | http://purl.imsglobal.org/vocab/lis/v2/membership\#Learner |
| Senior Learner | http://purl.imsglobal.org/vocab/lis/v2/membership\#Instructor |
| Admin | http://purl.imsglobal.org/vocab/lis/v2/institution/person\#Administrator |

**Infrastructure for Levels 3-4**

| Component | Status | Notes |
| :---- | :---- | :---- |
| MATLAB Production Server | Licensed | Needs server deployment |
| MATLAB Web App Server | Licensed | Needs server deployment |
| Server Hardware | Required | Can be on-prem or cloud |

 

**What JKKN Gets at Each Level**

| Level | Capability | Value |
| :---- | :---- | :---- |
| 1 | Links | 10,000+ Learners can access MATLAB Academy |
| 2 | LTI | Grades auto-sync, no duplicate accounts |
| 3 | Embedded Apps | Custom simulations without leaving MyJKKN |
| 4 | Backend API | MATLAB-powered features (drug checker, circuit analyzer) |

 

**Next Steps**

8\. 	\[ \] Implement Level 1 (Links) \- immediate value

9\. 	\[ \] Set up LTI 1.3 tool registration with MathWorks

10\.  \[ \] Plan infrastructure for Production Server / Web App Server

11\.  \[ \] Identify pilot use cases for embedded MATLAB apps

 

**References**

●  	\[MATLAB Production Server REST API\](https://www.mathworks.com/help/mps/restfuljson/restful-api.html)

●  	\[MATLAB Grader LMS Integration\](https://www.mathworks.com/help/matlabgrader/lms-integration.html)

●  	\[LTI 1.3 Specification\](https://www.imsglobal.org/spec/lti/v1p3/)

●  	\[MATLAB Web App Server\](https://www.mathworks.com/products/matlab-web-app-server.html)

 

\*Document Version: 2.0\*

\*Last Updated: 2026-01-12\*

