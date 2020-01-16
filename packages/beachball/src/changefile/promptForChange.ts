import { ChangeInfo, ChangeType } from '../types/ChangeInfo';
import { getChangedPackages } from './getChangedPackages';
import { getRecentCommitMessages, getUserEmail, getCurrentHash } from '../git';
import prompts from 'prompts';
import { getPackageInfos } from '../monorepo/getPackageInfos';
import { prerelease } from 'semver';
import { BeachballOptions } from '../types/BeachballOptions';

/**
 * Uses `prompts` package to prompt for change type and description, fills in git user.email, scope, and the commit hash
 * @param cwd
 */
export async function promptForChange(options: BeachballOptions) {
  const { branch, path: cwd, package: specificPackage, fetch } = options;

  const changedPackages = specificPackage ? [specificPackage] : getChangedPackages(branch, cwd, fetch);
  const recentMessages = getRecentCommitMessages(branch, cwd) || [];
  const packageChangeInfo: { [pkgname: string]: ChangeInfo } = {};

  const packageInfos = getPackageInfos(cwd);

  for (let pkg of changedPackages) {
    console.log('');
    console.log(`Please describe the changes for: ${pkg}`);

    const packageOptions = packageInfos[pkg].options;

    const showPrereleaseOption = prerelease(packageInfos[pkg].version);
    const changeTypePrompt: prompts.PromptObject<string> = {
      type: 'select',
      name: 'type',
      message: 'Change type',
      choices: [
        ...(showPrereleaseOption ? [{ value: 'prerelease', title: ' [1mPrerelease[22m - bump prerelease version' }] : []),
        { value: 'patch', title: ' [1mPatch[22m      - bug fixes; no backwards incompatible changes.' },
        { value: 'minor', title: ' [1mMinor[22m      - small feature; backwards compatible changes.' },
        { value: 'none', title: ' [1mNone[22m       - this change does not affect the published package in any way.' },
        { value: 'major', title: ' [1mMajor[22m      - major feature; breaking changes.' },
      ].filter(choice => !packageOptions?.disallowedChangeTypes?.includes(choice.value as ChangeType)),
    };

    if (changeTypePrompt.choices!.length === 0) {
      console.log('No valid changeTypes available, aborting');
      return;
    }

    if (options.type && packageOptions?.disallowedChangeTypes?.includes(options.type as ChangeType)) {
      console.log(`${options.type} type is not allowed, aborting`);
      return;
    }

    const descriptionPrompt: prompts.PromptObject<string> = {
      type: 'autocomplete',
      name: 'comment',
      message: 'Describe changes (type or choose one)',
      suggest: input => {
        return Promise.resolve([...recentMessages.filter(msg => msg.startsWith(input)), input]);
      },
    };

    const showChangeTypePrompt = !options.type && changeTypePrompt.choices!.length > 1;

    const questions = [
      ...(showChangeTypePrompt ? [changeTypePrompt] : []),
      ...(!options.message ? [descriptionPrompt] : []),
    ];

    let response: { comment: string; type: ChangeType } = {
      type: options.type || 'none',
      comment: options.message || '',
    };

    if (questions.length > 0) {
      response = (await prompts(questions)) as { comment: string; type: ChangeType };

      if (Object.keys(response).length === 0) {
        console.log('Cancelled, no change files are written');
        return;
      }
    }

    packageChangeInfo[pkg] = {
      ...response,
      packageName: pkg,
      email: getUserEmail(cwd) || 'email not defined',
      commit: getCurrentHash(cwd) || 'hash not available',
      dependentChangeType: 'patch',
      date: new Date(),
    };
  }

  return packageChangeInfo;
}
