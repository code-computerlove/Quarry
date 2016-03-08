"use strict";

var chalk    = require('chalk');
var inquirer = require('inquirer');
var fs       = require('fs-extra');
var path     = require('path');

var npmInstallPackage = require('npm-install-package')

var releaseService = require('../releaseService');
var fileTemplater = require('../fileTemplater');
var promptOptions = require('../promptOptions');
var templateDataManager = require('../templateDataManager');
var errorHandler = require('../errorHandler');
var utils = require('../utils');

var _log;
var _promptAnswers;
var _options;

var TEMPLATE_FILES_PATH = path.join(process.cwd(), '_cartridge');

module.exports = function(appDir) {

	return {
		init: init
	};

	function init(options) {
		_options = options;
		_log = utils.getLogInstance(_options);

		checkIfWorkingDirIsEmpty()
			.then(setupOnScreenPrompts)
			.catch(errorHandler)
	}

	function checkIfWorkingDirIsEmpty() {

		return new Promise(function(resolve, reject) {
			fs.readdir(process.cwd(), function(err, files) {
				if (err) reject(err);

				if(utils.filterDirectoryContents(files).length > 0) {
					_log.warn('');
					_log.warn(chalk.red('Warning: The directory you are currently in is not empty!'));
					_log.warn(chalk.red('Going through the setup will perform a clean cartridge installation.'));
					_log.warn(chalk.red('This will overwrite any user changes'));
					_log.warn('');

				} else {
					_log.warn('');
					_log.warn(chalk.bold('Running through setup for a new project.'));
					_log.warn(chalk.bold('This can be exited out by pressing [Ctrl+C]'));
					_log.warn('');
				}

				_log.warn(chalk.bold('Make sure you are running this command in the folder you want all files copied to'));
				_log.warn('');

				resolve();
			})
		})
	}

	function setupOnScreenPrompts() {
		promptOptions
			.getNewCommandPromptOptions()
		 	.then(function(promptOptions) {
		 		console.log('');
		 		inquirer.prompt(promptOptions, promptCallback);
	 		})
	}

	function promptCallback(answers) {
		_promptAnswers = answers;
		templateDataManager.setData(answers);

		if(_promptAnswers.isOkToCopyFiles) {

			_log.info('');
			_log.info('Inserting the cartridge...');

			releaseService
				.downloadLatestRelease(_log)
				.then(copyCartridgeSourceFilesToCwd)

		} else {
			_log.info('User cancelled - no files copied')
		}
	}

	function copyCartridgeSourceFilesToCwd(copyPath) {
		fs.copy(copyPath, process.cwd(), {
			filter: fileCopyFilter
		}, fileCopyComplete)
	}

	function fileCopyFilter(path) {
		var needToCopyFile = true;
		var filesDirsToExclude = getExcludeList();

		for (var i = 0; i < filesDirsToExclude.length; i++) {
			//Check if needToCopyFile is still true and
			//hasn't been flipped during loop
			if(needToCopyFile) {
				needToCopyFile = path.indexOf(filesDirsToExclude[i]) === -1;
			}
		};

		if(!needToCopyFile) {
			_log.debug(chalk.underline('Skipping path - ' + path));
		} else {
			_log.debug('Copying path  -', path);
		}

		return needToCopyFile;
	}

	function fileCopyComplete(err) {
		if (err) errorHandler(err);

		templateCopiedFiles();
	}

	function getExcludeList() {
		//Default exclude folders / files
		var excludeList = [
			'node_modules'
		];

		if(_promptAnswers.projectType === "Dot NET") {
			excludeList.push('views');
			excludeList.push('release.js');
		}

		return excludeList;
	}

	function templateCopiedFiles() {
		_log.debug('');
		_log.info('Booting up files...');

		fileTemplater.setConfig({
			data: templateDataManager.getData(),
			basePath: process.cwd(),
			files: getTemplateFileList(),
			onEachFile: singleFileCallback,
			onCompleted: installNpmPackages
		})

		fileTemplater.run();
	}

	function getTemplateFileList() {
		var fileList      = [];
		var destPath      = process.cwd();

		// Creds file
		fileList.push({
			src:  path.join(TEMPLATE_FILES_PATH, 'creds.tpl'),
			dest: path.join(destPath, '_config', 'creds.json')
		});

		// Project package file
		fileList.push({
			src:  path.join(TEMPLATE_FILES_PATH, 'package.tpl'),
			dest: path.join(destPath, 'package.json')
		});

		// Project readme
		fileList.push({
			src:  path.join(TEMPLATE_FILES_PATH, 'readme.tpl'),
			dest: path.join(destPath, 'readme.md')
		});

		// Cartridge config
		fileList.push({
			src:  path.join(TEMPLATE_FILES_PATH, 'rc.tpl'),
			dest: path.join(destPath, '.cartridgerc')
		});

		return fileList;
	}

	function singleFileCallback(templateFilePath) {
		_log.debug('Templating file -', templateFilePath);
	}

	function installNpmPackages() {
		if(_promptAnswers.cartridgeModules.length > 0) {
			console.log('');
			_log.info('Installing expansion packs...');

			npmInstallPackage(_promptAnswers.cartridgeModules, { saveDev: true}, function(err) {
				if (err) errorHandler(err);

				postInstallCleanUp();
			})
		} else {
			postInstallCleanUp();
		}
	}

	function postInstallCleanUp() {
		console.log('');
		_log.debug('Running post install cleanup');

		releaseService.deleteReleaseTmpDirectory();

		_log.debug('Deleting templates file directory: ' + TEMPLATE_FILES_PATH);
		fs.removeSync(TEMPLATE_FILES_PATH)

		finishSetup();
	}

	function finishSetup() {
		_log.info('');
		_log.info(chalk.green('Setup complete!'));
		_log.info('Cartridge project ' + chalk.yellow(_promptAnswers.projectName) + ' has been installed!');
		_log.info('');
		_log.info('Final steps:');
		_log.info(' · Run ' + chalk.yellow('npm install') + ' to download all project dependencies. (If this fails you may need to run ' + chalk.yellow('sudo npm install') + ')');
		_log.info(' · Run ' + chalk.yellow('gulp') + ' for initial setup of styles and scripts.');
		_log.info(' · Run ' + chalk.yellow('gulp watch') + ' to setup watching of files.');
		_log.info('');
	}
}
