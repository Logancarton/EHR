import { NextResponse } from "next/server";
import { getAuthenticatedProviderContext } from "../../../server/auth/provider-context";
import { clinicalActionError } from "../../../server/http/clinical-http";
import { ICD10_CM_VERSION, searchIcd10 } from "../../../server/reference/icd10";

/** ICD-10-CM code search for problem lists and diagnoses. Reference data; no patient data. */
export async function GET(req: Request) {
  try {
    getAuthenticatedProviderContext(req);
    const q = new URL(req.url).searchParams.get("q") ?? "";
    return NextResponse.json({ success: true, version: ICD10_CM_VERSION, results: searchIcd10(q) });
  } catch (error) {
    return clinicalActionError(error);
  }
}
