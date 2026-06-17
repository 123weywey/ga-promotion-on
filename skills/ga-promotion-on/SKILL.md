---
name: ga-promotion-on
description: Use when operating or updating the GA 프로모션ON dashboard, including monthly workbook uploads, branch promotion status views, employee ID login control, admin uploads, JPG or PPT downloads, and Supabase-backed month data handling.
---

# GA 프로모션ON

## Overview
`GA 프로모션ON`은 삼성생명 GA사업부의 월별 프로모션 운영 화면이다.  
핵심 원칙은 `월별 운영 파일을 업로드하면 하나의 URL에서 지점별 현황 조회, 대리점별 최종 프로모션 미리보기, JPG/PPT 다운로드까지 같은 기준으로 돌아가야 한다`는 점이다.

## When to Use
- 월별 프로모션 총괄판, 점포현황, PPT 템플릿 업로드 흐름을 수정할 때
- 지점별 프로모션 현황, 협의중/확정 상태 판정 로직을 점검할 때
- 로그인 사번 게이트, 관리자모드, 접속자 사번 업로드 기능을 수정할 때
- 최종 프로모션 미리보기와 JPG/PPT 다운로드 결과를 맞출 때
- Supabase에 월별 운영 데이터를 저장하거나 불러오는 흐름을 확인할 때

다음 경우에는 이 스킬이 아니다.
- 단순 문구 수정만 하는 일반 정적 페이지 편집
- GA 외 다른 사업부 전용 신규 서비스 설계

## Core Contract
이 프로젝트는 월별 운영 파일 3종과 접속자 사번 파일 1종을 기준으로 움직인다.

1. `프로모션 총괄판(.xlsx)`
대리점별 담당 여부, 최종확정여부, 상품군별 지급률과 시상값의 기준 파일이다.

2. `점포현황(.xlsx)`
지역단, 지점, 대리점, 조직번호, 등록번호를 포함하는 조직 편제 기준 파일이다.

3. `PPT 프로모션 장표 템플릿(.pptx)`
최종 프로모션 미리보기와 다운로드 장표의 배경/양식 기준 파일이다.

4. `접속자 사번(.xlsx)`
로그인 가능한 사용자 사번 목록 기준 파일이다.

## Access Rules
- 첫 진입 시 반드시 `사번 로그인`을 통과해야 한다.
- 허용 사번 목록은 접속자 사번 엑셀 기준으로 갱신된다.
- 사번 `29780`은 관리자 진입용 사번이며, 로그인과 동시에 관리자모드까지 들어간다.
- 일반 로그인 시 상단에는 `사번 ####` 배지만 보인다.
- 관리자모드에서는 같은 위치에 `접속자 업로드` 버튼이 보여야 한다.
- `관리자모드 ON` 버튼을 다시 누르면 일반 모드로 종료되어야 한다.

## Status Rules
- `확정`
총괄판 수치가 채워져 있고 최종 프로모션 미리보기, JPG 다운로드, PPT 다운로드가 가능한 상태다.

- `협의중`
점포현황상 대상 대리점이지만 총괄판 값이 비어 있거나 아직 확정되지 않은 상태다.

- `오류`
필수 컬럼 누락, 숫자 형식 문제, 업로드 파일 구조 오류처럼 정상 반영이 어려운 상태다.

## Branch Matching Rules
- 지점의 기본 대상 대리점 풀은 항상 `점포현황`이 우선 기준이다.
- 총괄판은 그 대상 대리점 풀 위에 `확정 여부`와 `숫자 값`을 덮어쓰는 역할이다.
- 총괄판 값이 없으면 `협의중`, 값이 있으면 확정 또는 반영 대상이다.
- 대리점 검색은 기본적으로 `총 지사` 전체 풀을 기준으로 동작해야 하며, 확정 필터만 기준이 되면 안 된다.

## Monthly Fallback Rules
- 해당 월 `점포현황`이 없으면 가장 최신 업로드된 점포현황을 fallback으로 사용한다.
- 해당 월 `PPT 템플릿`이 없으면 가장 최신 업로드된 PPT 템플릿을 fallback으로 사용한다.
- 해당 월 `총괄판`이 없으면 조직 편제는 보이되, 전체 상태는 `협의중`으로 보여야 한다.
- 1월처럼 총괄판 데이터를 비우기로 한 달은 점포현황만 유지하고 전부 협의중으로 처리한다.

## Admin Upload Rules
- 관리자모드에서 파일을 선택한 뒤 바로 반영되면 안 된다.
- 반드시 `선택 파일 저장`을 눌러야 Supabase에 반영된다.
- 관리자 업로드 영역에서는 월 기준으로 아래 항목들이 보여야 한다.
  - 총괄판
  - 점포현황
  - PPT
  - 접속자
- `미업로드` 표시는 빨간색 계열로 구분되는 것이 맞다.

## Storage Rules
- 운영 데이터는 GitHub가 아니라 `Supabase`를 기준 저장소로 쓴다.
- GitHub에는 코드만 저장하고, 업로드된 월별 원본 파일은 운영 데이터로만 관리한다.
- 브라우저 Local/IndexedDB는 임시 캐시일 뿐이며, 기준 데이터는 Supabase다.
- 배포는 `Vercel` 프로덕션 URL 기준으로 확인한다.

## Preview and Download Rules
- 최종 프로모션 미리보기는 선택된 월의 총괄판 숫자, 점포현황 편제, PPT 템플릿 기준이 일치해야 한다.
- 화면 미리보기와 JPG 다운로드 결과는 같은 기준 숫자를 써야 한다.
- PPT 다운로드도 가능해야 하며, 가능하면 내려받은 뒤 수정 가능한 형태를 유지한다.
- 협의중 상태에서는 미리보기와 다운로드를 제한하는 것이 기본값이다.

## Quick Reference
| 항목 | 기준 |
|---|---|
| 로그인 가능 여부 | 접속자 사번 엑셀 |
| 관리자 자동 진입 사번 | `29780` |
| 지점별 기본 대리점 풀 | 점포현황 |
| 확정/협의중 상태 판정 | 총괄판 |
| 최종 장표 배경 | 월별 PPT 템플릿 |
| 운영 데이터 저장소 | Supabase |
| 코드 저장소 | GitHub |
| 공개 운영 주소 | Vercel URL |

## Expected Output Shape
```json
{
  "month": "2026.06",
  "region": "GA서울지역단",
  "branch": "GA구로지점",
  "agency": "(주)예시대리점",
  "status": "confirmed",
  "loginRequired": true,
  "employeeUploadEnabled": true,
  "previewReady": true,
  "jpgDownloadReady": true,
  "pptDownloadReady": true,
  "storage": "supabase"
}
```

## Common Mistakes
- 점포현황보다 총괄판을 먼저 기준으로 삼아 지점별 전체 대상 대리점 수가 틀어지는 것
- 총괄판이 없는 미래 월에서도 이전 월 확정 대리점이 남아 보이는 것
- 화면 미리보기와 JPG 다운로드 숫자 기준이 서로 다른 것
- 관리자 업로드에서 파일 선택만 하고 저장하지 않았는데 반영된 것처럼 처리하는 것
- 업로드 원본 파일까지 GitHub에 같이 올리는 것
- 사번 입력 없이 자동 로그인되게 만드는 것
- 관리자모드에서 사번 배지와 접속자 업로드 버튼이 동시에 어색하게 보이는 것

## Final Working URL
- Production: `https://ga-promotion-on.vercel.app/docs/final-monthly-promotion-dashboard.html`
