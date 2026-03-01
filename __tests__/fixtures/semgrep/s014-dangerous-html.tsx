/**
 * S014 Test Fixture: dangerouslySetInnerHTML
 *
 * This file contains patterns that SHOULD trigger hawky-dangerous-innerhtml
 */

import React from 'react';

// SHOULD TRIGGER: dangerouslySetInnerHTML with user input
function UnsafeComponent({ userHtml }: { userHtml: string }) {
  return <div dangerouslySetInnerHTML={{ __html: userHtml }} />;
}

// SHOULD TRIGGER: innerHTML assignment
function setContentUnsafe(elementId: string, content: string) {
  const el = document.getElementById(elementId);
  if (el) {
    el.innerHTML = content;
  }
}

// SHOULD TRIGGER: querySelector innerHTML
function updateDivUnsafe(selector: string, html: string) {
  const div = document.querySelector(selector);
  if (div) {
    div.innerHTML = html;
  }
}

// SHOULD NOT TRIGGER: Sanitized with DOMPurify
import DOMPurify from 'dompurify';

function SafeComponent({ userHtml }: { userHtml: string }) {
  return <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userHtml) }} />;
}

// SHOULD NOT TRIGGER: Using textContent
function setContentSafe(elementId: string, content: string) {
  const el = document.getElementById(elementId);
  if (el) {
    el.textContent = content;
  }
}

// SHOULD NOT TRIGGER: Static HTML (though still flagged by rule, considered safe in practice)
function StaticComponent() {
  return <div dangerouslySetInnerHTML={{ __html: '<b>Static content</b>' }} />;
}

export { UnsafeComponent, SafeComponent, StaticComponent };
