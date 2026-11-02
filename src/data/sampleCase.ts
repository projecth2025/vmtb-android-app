// Local sample data ported from the web app's src/onboarding/sampleCase.ts.
// Sample data never reaches the pipeline or database.

export const SAMPLE_FILE_NAME = 'sample-case-report.pdf';
export const SAMPLE_PAGE_COUNT = 3;
export const SAMPLE_CANCER_TYPE = 'Lung Adenocarcinoma';
export const SAMPLE_AGE = 58;
export const SAMPLE_SEX = 'Male';
export const SAMPLE_CASE_NAME = 'LUAD41207';
export const SAMPLE_PATIENT = 'Anonymous';

export const SAMPLE_SUMMARY = `## Diagnosis
Lung adenocarcinoma, right upper lobe, moderately differentiated (CT-guided core biopsy).

## Stage of Disease
Clinical stage IVA: right upper lobe primary (4.2 × 3.6 cm) with right hilar and subcarinal nodes and two liver lesions suspicious for metastases.

## Molecular Profile
- EGFR exon 19 deletion (p.E746_A750del), VAF 22%
- TP53 p.R273H, VAF 18%
- Negative for ALK, ROS1, RET and NTRK fusions; KRAS, BRAF V600E and MET exon 14 skipping
- TMB 4 mut/Mb (low); MSI stable

## Immunohistochemistry
TTF-1 and Napsin A positive, p40 negative. PD-L1 (22C3) TPS 30%.

## Clinical Information
- ECOG performance status 1
- No bone lesions and no pleural effusion on CT

## Questions for the Board
- First-line choice for EGFR exon 19 deletion with a co-occurring TP53 mutation
- Whether the liver lesions need biopsy confirmation before starting treatment
`;

export const SAMPLE_QUESTIONS = [
  'First-line choice for EGFR exon 19 deletion with a co-occurring TP53 mutation?',
  'Do the liver lesions need biopsy confirmation before starting treatment?',
];

export const SAMPLE_OPINION = {
  author: 'Dr. Demo Oncologist',
  role: 'Medical oncology',
  content:
    'EGFR exon 19 deletion with stage IVA disease: first-line osimertinib is the preferred option. The TP53 co-mutation may shorten response duration, so plan closer imaging follow-up.',
};

export const SAMPLE_TREATMENT = {
  discussionDate: 'Board discussion (sample)',
  recommendation: 'Osimertinib 80 mg once daily as first-line therapy.',
  pathway: 'EGFR-targeted therapy',
  evidence: 'Strong (Tier I / ESCAT I-A)',
  implemented: true,
  followUp: {
    label: 'Follow-up at 3 months',
    status: 'Alive',
    notes: 'Partial response on CT; liver lesions smaller. Tolerating treatment well.',
  },
};

export const SAMPLE_BOARD = {
  name: 'Sample Thoracic Tumor Board',
  experts: 4,
  inviteCode: 'SAMPLE',
  cases: [
    {
      id: 'sample-board-case-1',
      caseName: 'LUAD41207',
      cancerType: 'Lung Adenocarcinoma',
      owner: 'Dr. Demo Oncologist',
      opinions: 3,
      status: 'verified' as const,
      age: SAMPLE_AGE,
      sex: SAMPLE_SEX,
      summary: SAMPLE_SUMMARY,
    },
  ],
};
