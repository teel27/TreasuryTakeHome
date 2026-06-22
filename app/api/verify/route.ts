import { NextRequest, NextResponse } from 'next/server';
import { extractLabel } from '@/lib/claude';
import { verifyLabel } from '@/lib/matching';
import type { ApplicationData } from '@/lib/types';

const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
type SupportedMediaType = (typeof SUPPORTED_TYPES)[number];

function isSupportedType(type: string): type is SupportedMediaType {
  return (SUPPORTED_TYPES as readonly string[]).includes(type);
}

export async function POST(request: NextRequest) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Could not read the uploaded form.' }, { status: 400 });
  }

  const image = formData.get('image');
  if (!image || !(image instanceof File)) {
    return NextResponse.json(
      { error: 'Please select a label image before verifying.' },
      { status: 400 },
    );
  }

  if (!isSupportedType(image.type)) {
    return NextResponse.json(
      { error: 'Unsupported image type. Please upload a JPEG, PNG, GIF, or WebP image.' },
      { status: 400 },
    );
  }

  const application: ApplicationData = {
    brandName: (formData.get('brandName') as string) ?? '',
    classType: (formData.get('classType') as string) ?? '',
    alcoholContent: (formData.get('alcoholContent') as string) ?? '',
    netContents: (formData.get('netContents') as string) ?? '',
  };

  const buffer = Buffer.from(await image.arrayBuffer());
  const imageBase64 = buffer.toString('base64');

  let extracted;
  try {
    extracted = await extractLabel(imageBase64, image.type as SupportedMediaType);
  } catch (err) {
    console.error('Claude extraction error:', err);
    return NextResponse.json(
      { error: 'Label analysis failed. Please try again.' },
      { status: 500 },
    );
  }

  const results = verifyLabel(extracted, application);
  return NextResponse.json({ results });
}
