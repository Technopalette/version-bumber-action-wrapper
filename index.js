const core = require('@actions/core');
const github = require('@actions/github');
const exec = require('@actions/exec');
const fs = require('fs');
const path = require('path');

async function run() {
  try {
    // Get inputs from the user
    const userToken = core.getInput('token', { required: true });
    const initialVersion = core.getInput('initial_version', { required: true });
    const forceInitial = core.getInput('force_initial') || 'false';
    
    // Get private repo access token from environment variable (SECURE)
    const CORE_ACCESS_TOKEN = process.env.CORE_ACCESS_TOKEN;
    
    if (!CORE_ACCESS_TOKEN) {
      throw new Error('CORE_ACCESS_TOKEN environment variable is required. Please contact action maintainer.');
    }
    
    console.log('🔧 Validating inputs...');
    console.log(`📦 Initial version: ${initialVersion}`);
    console.log(`🔄 Force initial: ${forceInitial}`);
    
    // Validate version format
    const versionRegex = /^\d+\.\d+\.\d+$/;
    if (!versionRegex.test(initialVersion)) {
      throw new Error('❌ initial_version must be in format x.y.z (e.g., 1.0.0)');
    }
    
    // Clone the private repository using environment variable
    console.log('🔐 Accessing private core action...');
    await exec.exec('git', [
      'clone',
      `https://x-access-token:${CORE_ACCESS_TOKEN}@github.com/Technopalette/version-bumber-action-core-private.git`,
      './core-action'
    ]);
    
    // Change to core action directory
    process.chdir('./core-action');
    
    // Set up environment variables that the core action expects
    process.env.INPUT_TOKEN = userToken;
    process.env.INPUT_INITIAL_VERSION = initialVersion;
    process.env.INPUT_FORCE_INITIAL = forceInitial;
    
    // Run the core action logic
    console.log('⚙️ Running core version bump logic...');
    
    // Get PR title from GitHub context
    const prTitle = github.context.payload.pull_request?.title || '';
    console.log(`📝 PR Title: ${prTitle}`);
    
    // Determine version bump type based on conventional commits
    let bumpType = 'none';
    if (prTitle.match(/^feat!:/) || prTitle.match(/^fix!:/) || prTitle.match(/BREAKING\s+CHANGE/)) {
      bumpType = 'major';
    } else if (prTitle.match(/^feat:/)) {
      bumpType = 'minor';
    } else if (prTitle.match(/^fix:/)) {
      bumpType = 'patch';
    }
    
    console.log(`🎯 Bump type determined: ${bumpType}`);
    
    // Calculate new version
    const [major, minor, patch] = initialVersion.split('.').map(Number);
    let newVersion;
    
    switch (bumpType) {
      case 'major':
        newVersion = `${major + 1}.0.0`;
        break;
      case 'minor':
        newVersion = `${major}.${minor + 1}.0`;
        break;
      case 'patch':
        newVersion = `${major}.${minor}.${patch + 1}`;
        break;
      default:
        newVersion = initialVersion;
        console.log('ℹ️ No version bump needed - PR title does not match conventional commit format');
    }
    
    console.log(`🔢 New version: ${newVersion}`);
    
    // Change back to original directory for git operations
    process.chdir('..');
    
    // Create and push tag if version changed
    if (bumpType !== 'none') {
      console.log('🔧 Setting up git configuration...');
      await exec.exec('git', ['config', 'user.name', 'github-actions[bot]']);
      await exec.exec('git', ['config', 'user.email', 'github-actions[bot]@users.noreply.github.com']);
      
      console.log(`🏷️ Creating tag: ${newVersion}`);
      await exec.exec('git', ['tag', '-a', newVersion, '-m', `Release version ${newVersion}`]);
      
      console.log('📤 Pushing tag...');
      await exec.exec('git', ['push', 'origin', newVersion]);
      
      console.log('✅ Tag created and pushed successfully!');
    }
    
    // Set output
    core.setOutput('new_version', newVersion);
    console.log(`🎉 Version bumping completed! New version: ${newVersion}`);
    
  } catch (error) {
    console.error(`❌ Action failed: ${error.message}`);
    core.setFailed(`Action failed: ${error.message}`);
  }
}

run();