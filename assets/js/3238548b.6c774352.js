"use strict";(self.webpackChunk_devilsdev_rag_pipeline_utils=self.webpackChunk_devilsdev_rag_pipeline_utils||[]).push([[7724],{6261:(e,s,n)=>{n.r(s),n.d(s,{assets:()=>a,contentTitle:()=>o,default:()=>u,frontMatter:()=>t,metadata:()=>i,toc:()=>c});const i=JSON.parse('{"id":"Use-Cases","title":"Real-World Use Cases","description":"Real-World Applications of RAG Pipeline Utils","source":"@site/docs/Use-Cases.md","sourceDirName":".","slug":"/Use-Cases","permalink":"/rag-pipeline-utils/docs/Use-Cases","draft":false,"unlisted":false,"editUrl":"https://github.com/DevilsDev/rag-pipeline-utils/edit/main/docs-site/docs/Use-Cases.md","tags":[],"version":"current","sidebarPosition":5,"frontMatter":{"id":"Use-Cases","title":"Real-World Use Cases","sidebar_position":5},"sidebar":"tutorialSidebar","previous":{"title":"Tutorials","permalink":"/rag-pipeline-utils/docs/Tutorials"},"next":{"title":"Usage","permalink":"/rag-pipeline-utils/docs/Usage"}}');var l=n(4848),r=n(8453);const t={id:"Use-Cases",title:"Real-World Use Cases",sidebar_position:5},o=void 0,a={},c=[{value:"Real-World Applications of RAG Pipeline Utils",id:"real-world-applications-of-rag-pipeline-utils",level:2},{value:"1. Customizable LLM Workflows",id:"1-customizable-llm-workflows",level:3},{value:"2. Plugin-Based Evaluation Benchmarks",id:"2-plugin-based-evaluation-benchmarks",level:3},{value:"3. Internal LLM System for SaaS",id:"3-internal-llm-system-for-saas",level:3},{value:"4. GitHub + NPM Automation for ML Pipelines",id:"4-github--npm-automation-for-ml-pipelines",level:3},{value:"Benefits",id:"benefits",level:3}];function d(e){const s={a:"a",blockquote:"blockquote",code:"code",h2:"h2",h3:"h3",hr:"hr",li:"li",p:"p",pre:"pre",strong:"strong",ul:"ul",...(0,r.R)(),...e.components};return(0,l.jsxs)(l.Fragment,{children:[(0,l.jsx)(s.h2,{id:"real-world-applications-of-rag-pipeline-utils",children:"Real-World Applications of RAG Pipeline Utils"}),"\n",(0,l.jsxs)(s.p,{children:["This project goes beyond traditional RAG tools \u2014 it\u2019s a ",(0,l.jsx)(s.strong,{children:"developer-focused modular framework"}),". Here's how it\u2019s used:"]}),"\n",(0,l.jsx)(s.hr,{}),"\n",(0,l.jsx)(s.h3,{id:"1-customizable-llm-workflows",children:"1. Customizable LLM Workflows"}),"\n",(0,l.jsxs)(s.p,{children:[(0,l.jsx)(s.strong,{children:"Use Case:"})," A team wants to test three different retrievers (Pinecone, Weaviate, Redis) and switch LLMs dynamically during eval."]}),"\n",(0,l.jsx)(s.pre,{children:(0,l.jsx)(s.code,{className:"language-bash",children:"rag-utils ingest sample.pdf --retriever pinecone --llm openai\n"})}),"\n",(0,l.jsx)(s.hr,{}),"\n",(0,l.jsx)(s.h3,{id:"2-plugin-based-evaluation-benchmarks",children:"2. Plugin-Based Evaluation Benchmarks"}),"\n",(0,l.jsxs)(s.p,{children:[(0,l.jsx)(s.strong,{children:"Use Case:"})," You want to run BLEU/ROUGE scoring across prompt templates or documents using CLI:"]}),"\n",(0,l.jsx)(s.pre,{children:(0,l.jsx)(s.code,{className:"language-bash",children:"rag-utils evaluate --dataset tests/eval.json --llm anthropic\n"})}),"\n",(0,l.jsx)(s.hr,{}),"\n",(0,l.jsx)(s.h3,{id:"3-internal-llm-system-for-saas",children:"3. Internal LLM System for SaaS"}),"\n",(0,l.jsxs)(s.p,{children:[(0,l.jsx)(s.strong,{children:"Use Case:"})," Embed RAG processing into a backend:"]}),"\n",(0,l.jsx)(s.pre,{children:(0,l.jsx)(s.code,{className:"language-js",children:"import { PluginRegistry, runPipeline } from 'rag-pipeline-utils';\n\nconst registry = new PluginRegistry();\nregistry.register('embedder', 'openai', new OpenAIEmbedder());\n\nconst output = await runPipeline({\n  loader: 'pdf',\n  retriever: 'pinecone',\n  llm: 'openai',\n  query: 'How does this work?'\n});\n"})}),"\n",(0,l.jsx)(s.hr,{}),"\n",(0,l.jsx)(s.h3,{id:"4-github--npm-automation-for-ml-pipelines",children:"4. GitHub + NPM Automation for ML Pipelines"}),"\n",(0,l.jsxs)(s.p,{children:[(0,l.jsx)(s.strong,{children:"Use Case:"})," You want a release blog post + versioned package published automatically:"]}),"\n",(0,l.jsxs)(s.ul,{children:["\n",(0,l.jsx)(s.li,{children:"Commit code"}),"\n",(0,l.jsxs)(s.li,{children:["Push to ",(0,l.jsx)(s.code,{children:"main"})]}),"\n",(0,l.jsxs)(s.li,{children:["GitHub Action triggers:","\n",(0,l.jsxs)(s.ul,{children:["\n",(0,l.jsx)(s.li,{children:"Semantic release"}),"\n",(0,l.jsx)(s.li,{children:"CHANGELOG update"}),"\n",(0,l.jsx)(s.li,{children:"Blog post generation"}),"\n",(0,l.jsx)(s.li,{children:"NPM publish"}),"\n"]}),"\n"]}),"\n"]}),"\n",(0,l.jsx)(s.hr,{}),"\n",(0,l.jsx)(s.h3,{id:"benefits",children:"Benefits"}),"\n",(0,l.jsxs)(s.ul,{children:["\n",(0,l.jsxs)(s.li,{children:[(0,l.jsx)(s.strong,{children:"Pluggable"})," components via clean interfaces"]}),"\n",(0,l.jsxs)(s.li,{children:[(0,l.jsx)(s.strong,{children:"CLI + programmatic"})," access for flexible DX"]}),"\n",(0,l.jsxs)(s.li,{children:[(0,l.jsx)(s.strong,{children:"CI-validated"})," plugin contract enforcement"]}),"\n",(0,l.jsxs)(s.li,{children:[(0,l.jsx)(s.strong,{children:"Docs-first"})," developer onboarding"]}),"\n",(0,l.jsxs)(s.li,{children:[(0,l.jsx)(s.strong,{children:"Production-ready"})," for real ML teams"]}),"\n"]}),"\n",(0,l.jsx)(s.hr,{}),"\n",(0,l.jsxs)(s.blockquote,{children:["\n",(0,l.jsxs)(s.p,{children:["Want to contribute your use case? PRs welcome on ",(0,l.jsx)(s.a,{href:"https://github.com/DevilsDev/rag-pipeline-utils",children:"GitHub"}),"."]}),"\n"]})]})}function u(e={}){const{wrapper:s}={...(0,r.R)(),...e.components};return s?(0,l.jsx)(s,{...e,children:(0,l.jsx)(d,{...e})}):d(e)}},8453:(e,s,n)=>{n.d(s,{R:()=>t,x:()=>o});var i=n(6540);const l={},r=i.createContext(l);function t(e){const s=i.useContext(r);return i.useMemo((function(){return"function"==typeof e?e(s):{...s,...e}}),[s,e])}function o(e){let s;return s=e.disableParentContext?"function"==typeof e.components?e.components(l):e.components||l:t(e.components),i.createElement(r.Provider,{value:s},e.children)}}}]);