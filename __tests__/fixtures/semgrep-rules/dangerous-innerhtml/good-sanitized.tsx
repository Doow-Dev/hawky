/**
 * GOOD: Safe dangerouslySetInnerHTML usage with sanitization
 * These patterns should NOT trigger hawky.security.dangerous-innerhtml-* rules
 */

import React from 'react';
import DOMPurify from 'dompurify';

// Mock alternative sanitizers
declare function sanitize(html: string): string;
declare function sanitizeHtml(html: string): string;

interface Props {
  htmlContent: string;
  userContent: string;
}

interface ApiData {
  html: string;
  content: string;
}

// GOOD: DOMPurify sanitization
function SafeContent({ htmlContent }: Props) {
  // ok: hawky.security.dangerous-innerhtml-variable
  return <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(htmlContent) }} />;
}

// GOOD: Sanitized props
function SafePropsContent(props: Props) {
  // ok: hawky.security.dangerous-innerhtml-user-input
  return <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(props.htmlContent) }} />;
}

// GOOD: Alternative sanitize function
function AlternativeSanitized({ htmlContent }: Props) {
  // ok: hawky.security.dangerous-innerhtml-variable
  return <div dangerouslySetInnerHTML={{ __html: sanitize(htmlContent) }} />;
}

// GOOD: sanitizeHtml library
function HtmlSanitizerContent({ htmlContent }: Props) {
  // ok: hawky.security.dangerous-innerhtml-variable
  return <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(htmlContent) }} />;
}

// GOOD: Sanitized API data
function SafeApiContent({ data }: { data: ApiData }) {
  // ok: hawky.security.dangerous-innerhtml-fetch-data
  return <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(data.html) }} />;
}

// GOOD: Static string literal (no variable)
function StaticContent() {
  // ok: hawky.security.dangerous-innerhtml-variable
  return <div dangerouslySetInnerHTML={{ __html: '<strong>Static content</strong>' }} />;
}

// GOOD: Pre-sanitized stored content with comment
function PreSanitizedContent() {
  // Content was sanitized on save, marked safe by security review
  const trustedHtml = '<p>Pre-sanitized content from trusted source</p>';
  // ok: hawky.security.dangerous-innerhtml-variable (static string)
  return <div dangerouslySetInnerHTML={{ __html: trustedHtml }} />;
}

// GOOD: Sanitize with options
function ConfiguredSanitize({ htmlContent }: Props) {
  const cleanHtml = DOMPurify.sanitize(htmlContent, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em'],
    ALLOWED_ATTR: [],
  });
  // ok: hawky.security.dangerous-innerhtml-variable
  return <div dangerouslySetInnerHTML={{ __html: cleanHtml }} />;
}

export {
  SafeContent,
  SafePropsContent,
  AlternativeSanitized,
  HtmlSanitizerContent,
  SafeApiContent,
  StaticContent,
  PreSanitizedContent,
  ConfiguredSanitize,
};
