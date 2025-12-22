import { Request, Response } from 'express';
import CarRequest from '../models/CarRequest';
import AgreementLog from '../models/AgreementLog';
import { AuthRequest } from '../middleware/auth';

// Request body interface for creating car request
interface CreateCarRequestBody {
  pickup: {
    address: string;
    city: string;
    postalCode: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
  };
  dropoff: {
    address: string;
    city: string;
    postalCode: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
  };
  date?: string; // ISO date string
  insurance?: {
    provider?: string;
    policyNumber?: string;
  };
  deductible?: number;
  title?: string;
  description?: string;
  carDetails?: {
    make: string;
    model: string;
    year?: number;
    licensePlate?: string;
  };
}

// Create new car request
export const createCarRequest = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const {
      pickup,
      dropoff,
      date,
      insurance,
      deductible,
      title,
      description,
      carDetails,
    } = req.body as CreateCarRequestBody;

    // Validate required fields
    if (!pickup || !pickup.address || !pickup.city || !pickup.postalCode) {
      res.status(400).json({ error: 'Pickup location is required (address, city, postalCode)' });
      return;
    }

    if (!dropoff || !dropoff.address || !dropoff.city || !dropoff.postalCode) {
      res.status(400).json({ error: 'Dropoff location is required (address, city, postalCode)' });
      return;
    }

    // Parse date if provided
    let preferredDate: Date | undefined;
    if (date) {
      preferredDate = new Date(date);
      if (isNaN(preferredDate.getTime())) {
        res.status(400).json({ error: 'Invalid date format. Use ISO date string.' });
        return;
      }
    }

    // Create car request
    const carRequest = new CarRequest({
      requester: userId,
      title: title || `Car relocation from ${pickup.city} to ${dropoff.city}`,
      description: description || '',
      pickupLocation: {
        address: pickup.address,
        city: pickup.city,
        postalCode: pickup.postalCode,
        coordinates: pickup.coordinates,
      },
      deliveryLocation: {
        address: dropoff.address,
        city: dropoff.city,
        postalCode: dropoff.postalCode,
        coordinates: dropoff.coordinates,
      },
      preferredDate,
      carDetails: carDetails || {
        make: '',
        model: '',
      },
      insurance,
      deductible,
      status: 'open',
      interestedDrivers: [],
    });

    await carRequest.save();

    // Populate requester for response
    await carRequest.populate('requester', 'firstName lastName email');

    res.status(201).json({
      success: true,
      message: 'Car request created successfully',
      carRequest: {
        id: carRequest._id,
        requester: carRequest.requester,
        title: carRequest.title,
        pickupLocation: carRequest.pickupLocation,
        deliveryLocation: carRequest.deliveryLocation,
        preferredDate: carRequest.preferredDate,
        carDetails: carRequest.carDetails,
        insurance: carRequest.insurance,
        deductible: carRequest.deductible,
        status: carRequest.status,
        createdAt: carRequest.createdAt,
      },
    });
  } catch (error: any) {
    console.error('Error creating car request:', error);

    if (error.name === 'ValidationError') {
      res.status(400).json({ error: 'Validation error', details: error.message });
      return;
    }

    res.status(500).json({ error: 'Failed to create car request' });
  }
};

// Placeholder: Get all car requests
export const getCarRequests = async (req: Request, res: Response): Promise<void> => {
  try {
    // TODO: Implement get car requests logic
    res.status(501).json({ message: 'Get car requests endpoint - not implemented yet' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get car requests' });
  }
};

// Placeholder: Get single car request
export const getCarRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    // TODO: Implement get single car request logic
    res.status(501).json({ message: 'Get car request endpoint - not implemented yet' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get car request' });
  }
};

// Placeholder: Update car request
export const updateCarRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    // TODO: Implement update car request logic
    res.status(501).json({ message: 'Update car request endpoint - not implemented yet' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update car request' });
  }
};

// Placeholder: Delete car request
export const deleteCarRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    // TODO: Implement delete car request logic
    res.status(501).json({ message: 'Delete car request endpoint - not implemented yet' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete car request' });
  }
};

// Placeholder: Express interest in car request (driver)
export const expressInterest = async (req: Request, res: Response): Promise<void> => {
  try {
    // TODO: Implement express interest logic
    res.status(501).json({ message: 'Express interest endpoint - not implemented yet' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to express interest' });
  }
};

// Accept request acknowledgment
interface AcceptRequestBody {
  role: 'driver' | 'owner';
  acknowledged: boolean;
}

export const acceptRequest = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { role, acknowledged } = req.body as AcceptRequestBody;
    const userId = req.user?._id;

    // Validate request body
    if (!role || (role !== 'driver' && role !== 'owner')) {
      res.status(400).json({ error: 'Invalid role. Must be "driver" or "owner"' });
      return;
    }

    if (typeof acknowledged !== 'boolean') {
      res.status(400).json({ error: 'acknowledged must be a boolean' });
      return;
    }

    if (!acknowledged) {
      res.status(400).json({ error: 'acknowledged must be true to accept' });
      return;
    }

    // Find the car request
    const carRequest = await CarRequest.findById(id);
    if (!carRequest) {
      res.status(404).json({ error: 'Car request not found' });
      return;
    }

    // Verify user is not the owner of the request
    if (carRequest.requester.toString() === userId?.toString()) {
      res.status(403).json({ error: 'Request owner cannot accept their own request' });
      return;
    }

    // Determine requester and driver based on role
    const requesterId = carRequest.requester;
    let driverId;

    if (role === 'driver') {
      // Authenticated user is the driver
      driverId = userId;
    } else if (role === 'owner') {
      // If role is "owner", user claims to be the requester, but we already verified they're not
      // This is a contradiction - reject it
      res.status(403).json({ 
        error: 'Invalid role. Request owner cannot accept their own request. Use role "driver" instead.' 
      });
      return;
    }

    if (!driverId) {
      res.status(400).json({ error: 'Driver not found for this request' });
      return;
    }

    // Determine agreement type based on context
    const agreementType: 'liability_acknowledgment' | 'terms_acceptance' | 'driver_selection' = 
      'liability_acknowledgment';

    // Check for duplicate acknowledgment
    const existingAgreement = await AgreementLog.findOne({
      carRequest: id,
      requester: requesterId,
      driver: driverId,
      agreementType,
    });

    if (existingAgreement) {
      res.status(409).json({ error: 'Acknowledgment already exists for this user and request' });
      return;
    }

    // Create consent text
    const consentText = `User ${role} acknowledged liability and terms for car request ${id}`;

    // Extract IP address and user agent
    const ipAddress = req.ip || req.socket.remoteAddress || undefined;
    const userAgent = req.get('user-agent') || undefined;

    // Save acknowledgment to AgreementLog
    const agreementLog = new AgreementLog({
      carRequest: id,
      requester: requesterId,
      driver: driverId,
      agreementType,
      consentText,
      ipAddress,
      userAgent,
      timestamp: new Date(),
    });

    await agreementLog.save();

    // TODO: Placeholder for request status update logic
    // Future: Update car request status, notify parties, etc.

    res.status(201).json({
      success: true,
      message: 'Acknowledgment saved successfully',
      agreementLog: {
        id: agreementLog._id,
        carRequest: agreementLog.carRequest,
        agreementType: agreementLog.agreementType,
        timestamp: agreementLog.timestamp,
      },
    });
  } catch (error: any) {
    console.error('Error accepting request:', error);
    
    if (error.name === 'ValidationError') {
      res.status(400).json({ error: 'Validation error', details: error.message });
      return;
    }

    if (error.name === 'CastError') {
      res.status(400).json({ error: 'Invalid request ID format' });
      return;
    }

    res.status(500).json({ error: 'Failed to accept request' });
  }
};

