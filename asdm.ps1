# CODE SAMPLE NOTES
# This script was in a functional state.Project was ready for further
#	testing. The specificity of the destinations was as requested.


# ***** Data Manager
# Script: asdm.ps1
# Version: 1.0
# Author: Paul Burgess
# Date: January 25, 2016
# requires -Version 5
# Comments: ASDM will wait for USB arrival event
# 	- check USB drives for specific files
# 	- check to see if those files exist in the specified destination
# 	- IF NOT - copies them to the specified destination(s)
# 	- THEN / OR IF EXIST - check MD5 sum
# 	- IF MD5 fails - re-copy and recheck MD5
#		- THEN copy to 2nd destination
#  	- THEN run a command

# Path(s) to write to
# - note NO trailing slash (IMPORTANT!)
$destinationPath = "C:\Projects\Company\data-manager\imagelocation1"
# if no 2nd destination wanted - empty the quotes
# but leave the variable defined ($destination2 = "")
$destination2 = "C:\Projects\Company\data-manager\imagelocation2"
$commandToRun = "dir"

# FUNCTION compareHash
# Receives 2 Obects
# Returns true or false based on MD5 hash comparison
function compareHash() {
	param (
		[System.Object] $fileSrc,
		[System.Object] $fileDst
	)
	if ((Get-FileHash $fileSrc -Algorithm MD5).Hash -eq (Get-FileHash $fileDst -Algorithm MD5).Hash) {
		return $true
	} else {
		return $false
	}
}
# Clear previous events if they exist
Remove-Event -SourceIdentifier volumeChange -ErrorAction 'SilentlyContinue'
# See if the event is already subscribed to
$eventCheck = Get-EventSubscriber
if ($eventCheck.SourceIdentifier -ne "volumeChange") {
	Register-WmiEvent -Class Win32_VolumeChangeEvent -SourceIdentifier volumeChange
}
$myError = 0
# Loop forever
while ($true) {
<#### Uncomment block below to wait for event instead of keypress ####>
#START WAIT FOR EVENT
	Write-Host "Waiting for a volume change event"
	$newEvent = Wait-Event -SourceIdentifier volumeChange
	$eventType = $newEvent.SourceEventArgs.NewEvent.EventType
	$eventTypeName = switch($eventType) {
		1 {"Configuration changed"}
		2 {"Device arrival"}
		3 {"Device removal"}
		4 {"Docking"}
	}
	Write-Host (Get-Date -Format s) " Event detected: Type" $eventType $eventTypeName
	#if device arrives (plugged in) (event 2)
	if ($eventType -eq '2') {
 #END WAIT FOR EVENT

	<#### Comment Line below for event waiting instead of keypress ####>
	# Read-Host "Press Enter"

	Write-Host "Script starting..."
	# create a custom object combining Win32_DiskDrive and Win32_LogicalDisk information
	$usbDisk = Get-WmiObject Win32_DiskDrive | Where-Object {$_.InterFaceType -eq "USB"} | ForEach-Object {
		$disk = $_
		$partitions = "ASSOCIATORS OF " +
			"{Win32_DiskDrive.DeviceID='$($disk.DeviceID)'}" +
			"WHERE AssocClass = Win32_DiskDriveToDiskPartition"
		Get-WmiObject -Query $partitions | ForEach-Object {
			$partition = $_
			$drives = "ASSOCIATORS OF " +
				"{Win32_DiskPartition.DeviceID='$($partition.DeviceID)'}" +
				"WHERE AssocClass = Win32_LogicalDiskToPartition"
			Get-WmiObject -Query $drives | ForEach-Object {
				New-Object -Type PSCustomObject -Property @{
					Disk = $disk.DeviceID
					DiskSize = $disk.Size
					DiskModel = $disk.Model
					DiskSerial = $disk.serialNumber
					Partition = $partition.Name
					RawSize = $partition.Size
					DriveLetter = $_.DeviceID
					VolumeName = $_.VolumeName
					Size = $_.Size
					FreeSpace = $_.FreeSpace
				}
			}
		}
	}
	$shellObject = New-Object -ComObject Shell.Application
	# parse the card for specified files
	Get-ChildItem $usbDisk.DriveLetter -recurse -include @("*.JPG", "*.JPEG","*.TIF", "*.CR2") |
		#
		ForEach-Object {
			$directoryObject = $shellObject.namespace($_.Directory.FullName)
			$fileObject = $directoryObject.ParseName($_.Name)
			# Get Date Taken metadata
			$dateTaken = $directoryObject.getDetailsOf($fileObject, 12)
			# Remove odd characters that mess things up
			$dateTaken = ($dateTaken -replace [char]8206) -replace [char]8207
			# Convert the Date Taken information to a date/time object
			$dateTaken = [datetime]::ParseExact($dateTaken, "g", $null)
			# Convert the date/time object to a date only string in the format of yyyy-MM-dd (2016-01-30)
			$dateTaken = $dateTaken.ToString("yyyy-MM-dd")
			# Build the destination directory
			$newFilePath = Join-Path $destinationPath $dateTaken
			if ($usbDisk.DiskSerial -eq $null) {
				$newFilePath = Join-Path $newFilePath $usbDisk.VolumeName
			} Else {
				$newFilePath = Join-Path $newFilePath $usbDisk.DiskSerial
			}
			# Define var with full destination file name
			$newFullName = Join-Path $newFilePath $_.Name
			# Check to see if remote file already exists locally
			Write-Host -NoNewLine $_": "
			if ([System.IO.File]::Exists($newFullName)) {
				Write-Host -NoNewline -ForegroundColor Green "Exists "
				Write-Host -NoNewline "Integrity Check: "
				# Compare HASH values
				if((compareHash $_ $newFullName) -eq $true) {
					Write-Host -ForegroundColor Green "PASSED "
					Remove-Item $_
					Return
				} else {
					Write-Host -NoNewline -ForegroundColor Red "FAILED "
					# If HASH compare failed - delete file and copy again
					Remove-Item $newFullName
					Copy-Item $_ -Destination $newFilePath
					Write-Host -NoNewline "| COPYING | "
						Write-Host -NoNewline "Integrity Check: "
					if (compareHash $_ $newFullName -eq $true) {
						Write-Host -ForegroundColor Green "PASSED"
						Remove-Item $_ -Force
						Return
					} else {
						Write-Host -ForegroundColor Red "FAILED TO COPY"
						$myError = 1
					}
					Return
				}
			} else {
				Write-Host -NoNewline -ForegroundColor Red "Non-Existant "
				# Create the destination directory if it doesn't yet exist
				if ((Test-Path $newFilePath) -eq $false) {
					mkdir $newFilePath -Force
				}
				Write-Host -NoNewline "| COPYING | "
				Copy-Item $_ -Destination $newFilePath
				Write-Host -NoNewline "Integrity Check: "
				if (compareHash $_ $newFullName -eq $true) {
					Write-Host -ForegroundColor Green "PASSED"
					Remove-Item $_ -Force
				} else {
					Write-Host -ForegroundColor Red "FAILED TO COPY"
					$myError = 1
				}
				Return
			}
		} # OBJECT END
		# Code below here will be executed after all files have been dealt with
		# Check for 2nd destination and copy all files
		if ($destination2 -ne "") {
			robocopy $destinationPath $destination2 /E /Z # /E copies subdirectories | /Z allows resume
		}
		# Remove all files on USB
		if ($myError -eq 0) {
			Remove-Item -Recurse $usbDisk.DriveLetter -exclude *System* -ErrorAction 'SilentlyContinue'
		}
		Write-Host "Batch Complete"
		# Run command after all files copied to both locations
		Write-Host "Running command: $commandToRun"
		& $commandToRun

	} # END IF EVENT TYPE
	Remove-Event -SourceIdentifier volumeChange -ErrorAction 'SilentlyContinue'
}
