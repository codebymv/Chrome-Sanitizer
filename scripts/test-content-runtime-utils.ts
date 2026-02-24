import assert from 'node:assert/strict';
import { formatDetectionAge, getUploadScanMode } from '../src/content/runtime-utils';

function runUploadModeTests(): void {
	assert.equal(getUploadScanMode('report.txt', 'text/plain'), 'text');
	assert.equal(getUploadScanMode('notes.MD', ''), 'text');
	assert.equal(getUploadScanMode('data.json', 'application/json'), 'text');
	assert.equal(getUploadScanMode('statement.PDF', 'application/pdf'), 'docx-pdf');
	assert.equal(getUploadScanMode('resume.docx', ''), 'docx-pdf');
	assert.equal(getUploadScanMode('archive.zip', 'application/zip'), 'binary');
}

function runDetectionAgeTests(): void {
	const now = 100_000;

	assert.equal(formatDetectionAge(now - 20_000, now), 'just now');
	assert.equal(formatDetectionAge(now - 120_000, now), '2m ago');
	assert.equal(formatDetectionAge(now - 7_200_000, now), '2h ago');
	assert.equal(formatDetectionAge(now + 5_000, now), 'just now');
}

function main(): void {
	runUploadModeTests();
	runDetectionAgeTests();

	console.log('✅ Content runtime utility tests passed (10 checks).');
}

main();